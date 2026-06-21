# 活动报名流程优化

## 问题诊断

当前 `公开活动页 → 点击报名 → 跳到 /u/c/:short` 这一段实际要经过 **3 次往返**，而 UI 上只有一个安静的"提交中"按钮，所以体感像卡死：

1. **submit → `activity-apply` edge function**
   - 如果填了"探店截图"字段，前端把整张图 base64（最大 5MB → 约 6.7MB payload）上传给 function；function 再 decode → 上传 Storage → 写 application → 写 voucher_claim。手机弱网下常常 5–10 秒。
2. **`navigate('/u/c/{short_code}')`**
   - PublicClaim 重新挂载，只显示一个旋转圈。
3. **PublicClaim → `voucher-claim-status`**
   - 再发一次请求拉券详情，又是 1–3 秒空白。

中间这两段（步骤 2、3）的等待是**纯浪费**——服务端报名成功时已经有完整的券信息，前端却扔掉重新拉。

## 优化目标

1. 报名按钮按下后，立刻出现**全屏 / 卡片级的「正在报名中，请稍等…」**遮罩，带步骤文案（"正在上传资料 → 正在生成优惠券"），消除"按了没反应"的错觉。
2. 跳到优惠券页时**直接显示券**，不再有第二次空白等待。
3. 顺手把上传图片的体积压下来，让弱网用户更快完成 step 1。

## 具体改动

### 1. `supabase/functions/activity-apply/index.ts`
- 成功分支返回**完整 claim 负载**（与 `voucher-claim-status` 同构）：`{ ok, short_code, claim: { code, status, expires_at, voucher: {...} } }`，"already 已领取"的分支同样返回。
- 其它逻辑保持不变；不动 DB 结构。

### 2. `src/pages/public/PublicActivity.tsx`
- 把 `submit()` 改为分阶段更新进度文案：
  - `phase = 'uploading'` → "正在上传报名资料…"（有图片字段时）
  - `phase = 'submitting'` → "正在为您生成优惠券…"
  - `phase = 'done'` → "报名成功，正在打开优惠券…"
- 提交期间渲染一个**居中遮罩卡片**（沿用暖棕主题）：BOOMER 文案 + spinner + 当前阶段文字 + "请勿关闭页面"。按钮自身也改为 `disabled + 正在报名中…`。
- 在调用 `navigate` 时把 `claim` 整包通过 `navigate(url, { state: { claim } })` 传过去；本地也 `sessionStorage.setItem('claim:'+code, json)` 兜底，防刷新丢失。
- 图片字段（type === 'image'）上传前做**客户端压缩**：用 canvas 缩到最长边 1280px、JPEG q=0.82，然后再转 dataURL。新增一个小工具函数 `compressImageToDataUrl(file)`（放在本文件内部即可，不新增公共文件）。同时把当前 5MB 上限保留作为兜底校验。

### 3. `src/pages/public/PublicClaim.tsx`
- 进入时先看 `location.state?.claim` 或 `sessionStorage` 里的 `claim:{short}`，命中就立刻渲染、不显示 loading；后台再静默调用 `voucher-claim-status` 做一次刷新（拿最新状态/过期信息），刷新失败也不报错。
- 没有命中（用户直接打开链接）时维持现有流程，但 loading 文案从纯 spinner 改为 "正在加载您的优惠券…"。

### 4. 不动的地方
- `voucher-claim-status`、`voucher_claims`/`activities` 表结构、RLS。
- 后台「我的活动 → 活动详情」页面不动。
- `ActivityFeedbackView` 不动（它是已领过券后再次进入活动页的视图，本身已经很快）。

## 验证步骤

1. 走一遍："新手机号 + 带图片字段"的活动报名 → 期望按下后立刻出现「正在报名中…」遮罩，阶段文字依次切换，跳转后**无白屏**，券二维码立即出现。
2. 走一遍："不带图片字段"的活动 → 应该 < 1.5s 完成。
3. 在刚领到券的页面**刷新**：仍能立刻显示券（命中 sessionStorage），后台静默刷新状态。
4. 直接打开别人发的 `/u/c/:short` 链接：维持现状但 loading 文案更友好。

## 不在本次范围

- 把 Storage 上传改成"前端直传 + signed url"（更彻底但要新增策略，留作下一步）。
- 重做活动详情页统计实时刷新。
