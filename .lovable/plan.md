
## 后台 SMS / OTP 测试页面

在 `/portal` 后台新增「短信测试」入口,管理员可输入手机号即时发真实 OTP 并校验对错,用来调通腾讯云 SMS 链路、排查签名/模板配置错误。

### 1. 新表 `sms_test_otp`(独立于业务表,避免污染)
```text
id uuid pk
phone text
code text (6位)
created_at / expires_at (5分钟)
consumed_at
created_by uuid  -- 发起测试的管理员
tencent_response jsonb  -- 保留腾讯云返回(RequestId/SerialNo/错误码)
```
RLS:仅 `admin` 可 SELECT/INSERT/UPDATE 自己的记录;含 GRANT。

### 2. 新 edge function `sms-test`(单函数双 action)

`POST /sms-test`,body `{ action: 'send' | 'verify', phone, code? }`
- 函数内用 `auth.getUser()` + `has_role('admin')` 鉴权,非管理员一律 403
- `action=send`:校验手机号格式、60s 限频、生成 6 位 code 入库、调 `send-sms`(`template: 'otp'`)真实发送,返回 `{ ok, request_id, serial_no, sdk_app_id, sign_name, template_id }` 失败时回显 `send-sms` 原始错误(`SignatureIncorrectOrUnapproved` 等)
- `action=verify`:查最近未过期未消费记录、比对 code、命中则标记 consumed,返回 `{ ok: true }` 或 `{ ok: false, reason }`

完全不动 `claim_otp` / `voucher_claims` / `send-sms` / `voucher-claim-send-otp`。

### 3. 新组件 `src/components/admin/SmsTestPanel.tsx`
- 顶部小卡:从 `/sms-test` 返回里展示当前 SDKAppID / 签名 / 模板 ID(不含密钥),一眼对账
- 表单一:手机号 + 「发送验证码」按钮(60s 倒计时)
- 表单二:验证码 + 「校验」按钮
- 结果区:
  - 发送成功 → 绿色提示 + RequestId/SerialNo
  - 发送失败 → 红色卡片显示腾讯云 `Code` / `Message`,便于诊断
  - 校验 → ✅ / ❌ + 原因(expired / mismatch / not_found)

### 4. 接入 Portal
`src/pages/Portal.tsx`:
- `TabKey` 联合追加 `'sms_test'`
- 「系统」分组追加 `{ key: 'sms_test', label: '短信测试', icon: MessageSquare, perm: 'settings.ai' }`(复用现有管理员权限)
- 渲染分支加 `effectiveTab === 'sms_test' && <SmsTestPanel />`

### 不做
- 不暴露 SecretId/SecretKey
- 不前端打印 code 明文(只有数据库里有,且 admin 可查)
- 不改任何现有 SMS 业务逻辑
