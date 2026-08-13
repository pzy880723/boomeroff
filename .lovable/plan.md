# 只读审计：phone-login-send-otp / phone-login-verify-otp 生产日志

## 目标
在 2026-08-13 01:15Z 之后的窗口内，只读检查两个 Edge Function 的最新生产日志，回报耗时与错误状态，不修改任何代码/数据库/Secrets/部署。

## 执行步骤
1. 通过 Supabase 边缘函数日志工具，分别读取 `phone-login-send-otp` 与 `phone-login-verify-otp` 在 2026-08-13 01:15:00Z 之后的最新日志。
2. 对 `send-otp`：
   - 定位最新一次成功调用（HTTP 200 或应用级 `phone_login_otp_sent`）。
   - 提取并报告 `duration_ms`。
   - 提取 boot 时间（`booted (time: Xms)`）。
   - 提取边缘请求总耗时（网关/日志中的 duration）。
3. 对 `verify-otp`：
   - 列出最新请求的边缘总耗时、HTTP 状态。
   - 提取 boot 时间。
   - 列出任何错误（应用日志或函数错误）。
4. 全局检查：
   - 在两函数日志中搜索 `sign`、`decode`、`Base64`、`malformed`、`[tencent-sms] failed` 等关键字，确认短信签名 Base64 解码错误未再出现。
5. 输出：
   - 仅输出耗时（duration_ms、boot 时间、请求总耗时）和错误状态。
   - 不输出手机号、验证码、token、密钥或任何个人可识别信息。

## 不变更承诺
- 不修改代码、数据库、Secrets。
- 不部署或重新部署 Edge Function。
- 不产生 Git commit。
