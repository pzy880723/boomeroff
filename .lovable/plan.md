## 一、优惠券模板加「有效时间范围」+ 三状态

### 数据库
- `vouchers` 表新增 `starts_at timestamptz`、`ends_at timestamptz`（都可空，兼容老数据）。
- 触发器 `voucher_claims_set_expires` 升级：领取时 `expires_at = LEAST(claimed_at + valid_days, ends_at)`；若领取时 `now() > ends_at` 则直接置 `expired`。
- `delete_voucher_safe` 不变（仍按 claim 是否到期判断）。
- 在 voucher-redeem edge function 中，除了原本的 `expires_at` 校验外，额外拦截"模板已结束（`vouchers.ends_at < now()`）"。

### 状态判断（前端 util）
在 `src/lib/voucher.ts` 新增 `getVoucherTemplateTimeInfo(v)`：
- `starts_at > now()` → **待生效**（outline/灰）
- `ends_at < now()` → **已结束**（destructive/红）
- 其余 → **已生效**（default/绿）
- 同时返回剩余天数 / 距开始天数文案。

### UI
- `VoucherEditDialog`：新增两个 `datetime-local` —— 「开始时间」默认 `now()`，「结束时间」可选；校验 ends > starts。保留原"有效期 N 天"（继续作为领取后的相对截止，与模板结束取较早者）。
- `VouchersMine.tsx` 列表卡片右上角加状态 Badge + 倒计时文案。
- `VoucherDetailDialog`：券面下方显示「生效时间：x ~ y」；待生效/已结束时禁用「发放」按钮并提示。
- `PublicClaim.tsx`：未到 `starts_at` → 显示"该券尚未到生效时间，请在 yyyy-MM-dd HH:mm 后再来领取"；过 `ends_at` → 显示"该券已结束"，隐藏领取表单。
- `VoucherRedeem.tsx`：模板已过期时显示"该券已结束，无法核销"。

## 二、修复 /u/c/xxx 领取成功后核销码不显示

排查并修复 `PublicClaim.tsx`：

1. `voucher-claim-accept` 返回成功后，目前调用 `fetchStatus()` 重新拉取。问题可能是 `voucher-claim-status` 走的 lookup（`short_code` 大写）和触发器写入的 `code` 字段有偏差，或 React state 没刷新 QR 区块的 key。
2. 修复方案：
   - accept 成功时直接用返回里携带的最新 claim 字段（让 accept function 同时返回 `{ok, claim: {code, short_code, status, claimed_at, expires_at}}`），不再依赖二次查询。
   - 渲染 QR 区块加 `key={claim.code}` 强制重挂载；并在 QR 上方明显展示 8 位 `code`（券码）作为兜底，即便二维码出问题用户也能报口令。
   - QrCanvas 当 `value` 为空时不调用 `QRCode.toCanvas`，避免画布留白；并在 console 输出失败原因便于排查。
3. 校验 `voucher_claims_set_code` 触发器是否真实写入了 `code`（如未写入，QR 当然空）—— 通过 SQL 抽查现有 claimed 行验证；如确有 NULL，迁移里补一段 UPDATE 兜底。

## 三、完善"直接发放"OTP 短信对接

当前 `voucher-claim-send-otp` 已调 `send-sms` 的 `otp` 模板（用 `TENCENT_SMS_OTP_TEMPLATE_ID`），但失败提示混乱。改进：

- send-otp 失败时把 `sms_unavailable` / `具体错误` 直接 toast 给客户，并在表单下显示「短信暂不可用？联系店员手动核销」。
- 60s 倒计时按钮文案与 disabled 状态保持现状。
- 不改 OTP 流程本身（用户确认这部分功能 OK）。

## 四、活动入口免验证码（已实现，仅核对）

`activity-apply` 已直接生成 `status='claimed'` 的 claim 并跳转 `/u/c/<short_code>`。`PublicClaim` 检测到 `status='claimed'` 时跳过填表，直接显示核销 QR，逻辑符合预期 —— 修完第二点后这条链路也会自动恢复。

## 涉及文件

- 迁移：`vouchers` 加列 + 触发器升级（一条 migration）
- `src/lib/voucher.ts`：`getVoucherTemplateTimeInfo`
- `src/components/voucher/VoucherEditDialog.tsx`
- `src/components/voucher/VoucherDetailDialog.tsx`
- `src/pages/VouchersMine.tsx`
- `src/pages/VoucherRedeem.tsx`
- `src/pages/public/PublicClaim.tsx`
- `src/components/voucher/QrCanvas.tsx`（空值兜底）
- `supabase/functions/voucher-claim-accept/index.ts`（返回完整 claim）
- `supabase/functions/voucher-redeem/index.ts`（模板 ends_at 拦截）

确认后切到 build 模式即可开始改。