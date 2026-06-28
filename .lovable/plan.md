## 目标
在公开活动报名页面强制走「手机号 + 短信验证码」校验，杜绝随意填写手机号领券，并在发送验证码前就拦截「已领取过」的手机号。

## 体验流程（PublicActivity 报名表单）

```
[姓名]
[手机号 ____________]  [发送验证码]  ← 60s 倒计时
[验证码 ______]
[其他自定义字段 / 截图]
[✓ 同意协议]
[报名领取] ← 仅"已通过验证"时可点
```

- 点「发送验证码」：前端先校验手机号格式 → 调 `activity-apply-send-otp` → 后端检查"该活动 + 该手机号"是否已存在申请，若已存在直接返回 `already=true`，前端弹"您已领取过，是否查看我的券？"并跳到查券流程，不发送短信。
- 验证码 6 位，5 分钟有效，同号 60 秒内不重发（沿用 voucher OTP 节流策略）。
- 「报名领取」时把 `phone + code` 一起带去 `activity-apply`，服务端二次校验通过后才写入 `activity_applications` 并发券；校验失败不消耗申请名额。
- 切换手机号会清空已通过的验证状态，需要重新发码。

## 后端改造

### 1) 新表 `activity_apply_otp`（迁移）
字段：`id, activity_id, phone, code, expires_at, consumed_at, created_at`，索引 `(activity_id, phone, created_at desc)`。RLS：仅 `service_role` 可读写，匿名 `anon` 无策略（通过 edge function 访问）。

### 2) 新 edge function `activity-apply-send-otp`
- 入参：`share_token, phone`
- 校验活动有效 + 手机号格式 + 60s 节流
- 命中 `activity_applications.applicant_phone` 已存在 → 直接返回 `{ already:true, short_code }`，不发短信
- 否则写 OTP 记录 + 调 `send-sms`（复用 `template:'otp'`）

### 3) 修改 `activity-apply`
- 新增必填入参 `otp_code`
- 在原有"字段校验"之前查 `activity_apply_otp`：必须存在 (activity_id+phone+code) 且未过期未消费，否则返回 400「验证码错误或已过期」
- 通过后把该 OTP 标记 `consumed_at=now()`
- 已申请逻辑保持不变（兜底）

## 前端改造（仅 `src/pages/public/PublicActivity.tsx`）

- 新增状态：`otpCode, otpSending, otpCooldown, otpVerifiedPhone`
- 手机号输入旁加「发送验证码」按钮 + 倒计时
- 新增验证码输入框（数字、6 位）
- `submit()` 改为：必须 `otpVerifiedPhone === phone` 且 `otpCode` 已填；把 `otp_code` 传给 `activity-apply`
- 「发送验证码」收到 `already=true` 时，自动写入 `localStorage` 并跳到券详情页（沿用已有 `navigate('/u/c/<short_code>')` 路径）
- 错误文案中文化：手机号已领取 / 验证码错误 / 验证码已过期 / 发送过于频繁

## 不动的部分

- `lookup_by_phone`（已领取查询入口）保持原样
- 活动后台 / 我的活动 / 优惠券核销逻辑不变
- 老的 `claim_otp` 表与 `voucher-claim-send-otp` 不动，避免影响现有"先建券后领取"的旧链路
