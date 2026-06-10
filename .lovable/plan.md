## 目标

把"抵用券详情/转发/领取"这一整条链路改得更洋气好用：

1. 视觉重做（详情弹窗 + 公开领取页 + 新增"定向发放页"）
2. "生成转发链接" → 改名 **定向发放**，点击跳转一个独立页面：上半是好看的抵用券海报图，下半是短链 + 二维码 + 复制按钮，支持长按图片保存
3. 转发链接走短链（站内 `/u/c/:short` 跳转）
4. 用户领取流程改为**短信二次确认**：
   - 用户在领取页输姓名+手机 → 发短信验证码 → 输验证码 → 才算领取成功
   - 防止误领、刷领、转发被陌生人薅羊毛

## 用户流程

### 管理员侧
```text
我的抵用券 → 点某张券 → 详情弹窗
                       ├─ [定向发放]  → /me/vouchers/share/:claimId  (海报页)
                       └─ [编辑]

海报页:
 ┌──────────────────┐
 │  生成的抵用券海报  │  ← 可长按保存 / 右上"保存图片"
 │   (¥50 大字 + 品  │
 │   牌色 + 二维码 +  │
 │   说明 + 短链文字) │
 └──────────────────┘
 短链: boomeroff.app/u/c/AB12CD
 [复制短链] [复制图片] [下载海报]
```

### 顾客侧（公开页 `/u/c/:short`）
```text
1. 打开链接 → 看到精美抵用券卡片
2. 点 [立即领取] → 输姓名 + 手机号
3. 点 [获取验证码] → 后端 send-sms 发 6 位码（60s 倒计时）
4. 输验证码 → 点 [确认领取]
5. 领取成功 → 显示核销二维码 + 券码
```

## 技术方案

### 1. 数据库 migration
- `voucher_claims` 增加：
  - `short_code text unique`（6-8 位 base62，作为短链路径）
  - 触发器：insert 时若空自动生成
- 新增 `claim_otp` 表：
  - `id, claim_id (fk), phone, code text, expires_at, attempts int, verified_at, created_at`
  - RLS：只 service_role 可访问（edge function 用）
  - 同手机号 60s 内不能重复发；每条 OTP 5 分钟过期；最多 5 次尝试

### 2. Edge functions
- **`voucher-claim-send-otp`**（新）：入参 `{ short_code | share_token, phone, name }` → 校验 claim 仍 unclaimed → 写 claim_otp → 调 `send-sms`
- **`voucher-claim-accept`**（改）：入参追加 `otp` → 校验 OTP 后才把 claim 改为 `claimed`、写入 name/phone
- `voucher-claim-status` 支持 `short_code` 入参

### 3. 前端
- **新页面** `src/pages/VoucherSharePoster.tsx`（路由 `/me/vouchers/share/:claimId`）：
  - 用 html-to-image（已有或新增 `html-to-image` 包）把海报 DOM → PNG，支持下载/复制
  - 海报内容：品牌渐变背景、¥50 大字、规则、有效期、底部二维码 + 短链 + "扫码或长按识别"
- **`VoucherDetailDialog.tsx`**：
  - 整体重做：去掉灰底卡片，改为深色渐变券形卡（带"齿孔"凹口、金色描边）
  - 按钮 "生成转发链接" → **"定向发放"**，点击调 `voucher-claim-create` 拿到 claim 后 `navigate(/me/vouchers/share/:claimId)`
  - "领取与核销记录" 列表项也美化（状态徽章 + 复制短链）
- **`PublicClaim.tsx`** 路由从 `/u/claim/:token` → `/u/c/:short`（保留旧路由 301 跳转）：
  - 重做视觉：渐变背景、磁带券造型、动画
  - 加入"获取验证码 → 输验证码 → 确认领取"两步
  - 顶部加 [保存为图片] 按钮（同 html-to-image），方便顾客自己留图
- **`src/lib/voucher.ts`**：
  - `buildClaimShareUrl(short_code)` 改返回短链 `/u/c/:short`

### 4. 短信模版（用已有 `send-sms`）
- 复用现有 send-sms（阿里云/腾讯云），新增 `template: 'otp'`，模板变量 `{code}`
- 用户需在 `/portal` 配 `SMS_OTP_TEMPLATE_CODE`；未配置时降级为"短信通道未配置，请联系管理员"

### 5. 海报生成
- 新增依赖：`html-to-image`（轻量、~25kb）
- 设计稿：800x1200 海报，品牌主色渐变 + Ticket 图标 + 大金额 + 二维码白底 + 底部短链
- 移动端长按图片即可触发系统"保存到相册"

## 范围外（本轮不做）
- 微信原生分享卡片 / JSSDK
- 海报模板自定义（先一套统一样式）
- 短链跳转的统计与防刷

## 文件清单
- 新增：`supabase/migrations/<ts>_voucher_otp_and_shortcode.sql`
- 新增：`supabase/functions/voucher-claim-send-otp/index.ts`
- 改：`supabase/functions/voucher-claim-accept/index.ts`（加 OTP 校验）
- 改：`supabase/functions/voucher-claim-status/index.ts`（支持 short_code）
- 新增：`src/pages/VoucherSharePoster.tsx`
- 新增：`src/components/voucher/VoucherPoster.tsx`（可复用海报 DOM）
- 改：`src/components/voucher/VoucherDetailDialog.tsx`（重做 + "定向发放"）
- 改：`src/pages/public/PublicClaim.tsx`（重做 + OTP 流程）
- 改：`src/lib/voucher.ts`（短链 helper）
- 改：`src/App.tsx`（新路由 `/me/vouchers/share/:claimId`、`/u/c/:short`）
- 改：`package.json`（加 html-to-image）
