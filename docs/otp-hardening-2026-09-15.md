# 手机验证码（OTP）加固记录 — 2026-09-15

## 范围
仅认证：手机验证码登录/注册/绑定的服务端加固。不改注册权限政策，不改 Web UI。

## 数据库
- 迁移 `20260915165801_92fc3f66-d0bd-4c97-bf8f-d34647569fa4.sql`
  - `phone_login_otp` 新增 `purpose`（`login|register|bind`，**DEFAULT 'login'**）与 `ip_hash`
  - 新增 `issue_phone_otp_v1`、`consume_phone_otp_v1`（SECURITY DEFINER，EXECUTE 仅 `service_role`）
- 迁移 `20260915170516_08460d1e-9ab3-48cc-ad5a-30c87adb024f.sql`
  - 发码固定顺序加三把事务锁，锁范围与计数范围一致：
    `otp:phone:<phone>` → `otp:phone_purpose:<purpose>:<phone>` → `otp:ip:<ip_hash>`（非空时）

## 切换窗口的已知限制（部署 / 回滚）
`purpose` 的 `DEFAULT 'login'` 会把**迁移瞬间仍在有效期内的历史注册/绑定验证码**一律标为 `login`，
这些旧码在切换后理论上可用于登录接口（用途隔离对它们不生效）。

- 本次实际影响：迁移已超过 5 分钟 TTL，窗口内的旧码全部自然过期，无残留。
- 若将来重做同类迁移或**回滚**本次改动：在迁移语句之后立即执行
  `UPDATE public.phone_login_otp SET used_at = now() WHERE used_at IS NULL;`
  作废切换瞬间的全部在途验证码。
- 本轮不追溯作废任何码，以免误伤用户当前正在使用的新验证码。

## 注册顺序（public-register）
确定性拒绝（参数格式 → 手机号已占用 → 用户名已占用）全部在**原子消费验证码之前**；
消费仍在 `createUser` 之前，保持一次性、不可并发复用。用户改名后可用同一条验证码重试。

## 对外稳定字段
- code 全小写 snake_case；成功发码带 `cooldown_seconds`、`expires_in_seconds`
- 失败带 `error`（中文）、`code`，按情形附 `retry_after_seconds`、`attempts_left`

## 运营商本机号码认证
未开通、未接入任何供应商（无密钥、无应用绑定、无 SDK）。腾讯号码认证 2026-05 起仅存量白名单且不支持 Flutter。
