## 目标
让"已领过券的探店博主"再次扫海报二维码时，进入 **反馈页** 而非报名页：
1. 顶部卡片：重新打开自己的优惠券（再截图一次） + 显示券状态。
2. 中部：上传"发布截图"（多张）+ 填写"发布链接"（小红书/抖音笔记 URL）+ 备注。
3. 已提交过的反馈可见，可补充/修改后再次提交。
4. 给"换了浏览器、没记录"的用户一个"我已领取过？"入口 → 输手机号回查。

## 实施

### 1. 数据库
```
ALTER TABLE public.activity_applications
  ADD COLUMN IF NOT EXISTS publish_url text;
```
（`publish_screenshots` / `publish_confirm_note` 已有，复用。）

### 2. 新建 edge function `activity-feedback`
verify_jwt = false。统一一个入口，根据 `action` 分支，全部用 service role：
- `action: 'get'` — body: `{ share_token, short_code }`  
  校验 short_code 属于该 activity → 返回 `{ application: {publish_screenshots, publish_url, publish_confirm_note, publish_confirmed}, claim: {short_code, status, expires_at, redeemed_at}, voucher: {name, rule, valid_days} }`。
- `action: 'lookup_by_phone'` — body: `{ share_token, phone }`  
  按 activity + phone 查 application → 返回 `short_code` 或 `{ found:false }`。
- `action: 'upload'` — body: `{ share_token, short_code, filename, data_url }`  
  校验后用 service role 上传到 `voucher-screenshots/publish/{app_id}/{uuid}.{ext}`，返回 `{ path, signed_url }`。
- `action: 'submit'` — body: `{ share_token, short_code, publish_screenshots: string[], publish_url?: string, note?: string }`  
  校验后 update `activity_applications`：写入 3 字段（不改 `publish_confirmed`——管理员仍要复核）。

### 3. 前端 `src/pages/public/PublicActivity.tsx`
- 进入页面时检查：
  1. `localStorage[activity_claim:{shareToken}]` 是否存了 `short_code`；
  2. URL 中是否带 `?claim=XXXX`（兼容跨设备分享）。
  - 命中 → 调 `activity-feedback get` → 切到反馈视图。
- 表单页右上角加 "我已领取过？" 链接 → 弹窗输手机号 → `lookup_by_phone` → 写入 localStorage 并切到反馈视图。
- `submit()` 现有流程在 `navigate('/u/c/...')` 之前增加：`localStorage.setItem('activity_claim:'+shareToken, short_code)`。

### 4. 新组件 `src/components/public/ActivityFeedbackView.tsx`
```
┌──────────────────────────┐
│ 你的优惠券 [已领取/已核销] │
│ ¥xx · 满xx · 有效至 xxxx │
│ [打开优惠券查看二维码] →  │   navigate(/u/c/short_code)
├──────────────────────────┤
│ 发布反馈                 │
│ 上传发布截图（多张）      │
│ 发布链接 (小红书/抖音 url)│
│ 备注 (可选)              │
│ [提交反馈]               │
├──────────────────────────┤
│ 已提交内容（可再次修改）   │
└──────────────────────────┘
```
- 图片复用 `ImageLightbox`（已存在）。
- 上传走 `activity-feedback upload`（base64），不依赖匿名 storage 策略。
- 提交后 toast + 刷新数据。

### 5. 不动
- 不改 voucher / claim 业务、海报二维码（仍指向同一 `/a/:shareToken`）。
- 不改管理员 `PublishConfirmDialog`，它会看到博主自助上传的截图与链接。
- 不改 storage bucket 公开性。
