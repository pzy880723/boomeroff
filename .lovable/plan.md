# 接入腾讯云短信通知

## 你需要在腾讯云控制台做的准备

1. **开通短信 SMS 服务**(国内短信)
2. **申请签名**:中文 1-12 字,例如 `BOOMER-OFF` 或店铺名称,需要营业执照,1-2 工作日审核
3. **申请正文模板**(验证码类型):
   - 内容示例:`您的验证码为{1},5分钟内有效,请勿泄露。`
   - 审核通过后记下 **模板 ID**(纯数字,如 `1234567`)
4. **应用管理 → 应用列表**,记下 `SdkAppId`(如 `1400xxxxxx`)
5. **访问管理 → API 密钥管理**,新建 `SecretId` / `SecretKey`(子账号策略仅授予 `QcloudSMSFullAccess`)

## 需要存入 Lovable Cloud 的 Secret

| Secret 名 | 值 |
|---|---|
| `TENCENT_SMS_SECRET_ID` | API SecretId |
| `TENCENT_SMS_SECRET_KEY` | API SecretKey |
| `TENCENT_SMS_SDK_APP_ID` | SdkAppId(纯数字) |
| `TENCENT_SMS_SIGN_NAME` | 签名内容(不含【】) |
| `TENCENT_SMS_OTP_TEMPLATE_ID` | OTP 模板 ID(纯数字) |

区域固定 `ap-guangzhou`,写死在代码里。

## 代码改造

### 1. `supabase/functions/send-sms/index.ts` 改造为腾讯云真实实现

- 直接调用 `https://sms.tencentcloudapi.com` REST 接口(Action=`SendSms`,Version=`2021-01-11`)
- 自行实现 **TC3-HMAC-SHA256 签名**(Deno 标准库 `crypto.subtle` 即可,无需引入 SDK)
- 入参:
  - `PhoneNumberSet`:`["+86" + phone]`(仅中国大陆)
  - `SmsSdkAppId`:env
  - `SignName`:env
  - `TemplateId`:env(根据调用方传入的 `template` 字段路由,目前只有 `otp`)
  - `TemplateParamSet`:`[code]`
- 检查环境变量缺失时返回 503 `{ error: 'sms_not_configured' }`,前端提示"管理员后台仍可手动核销"
- 腾讯云返回的 `Response.Error.Code` 不为空时,把 Code 和 Message 透传到调用方,并写入 `voucher_logs`(便于排查)

### 2. `voucher-claim-send-otp` — 无需改动

它已经通过 `supabase.functions.invoke('send-sms', ...)` 调用,自动走新实现。

### 3. 失败回退

- 若 `send-sms` 返回 503/失败:`voucher-claim-send-otp` 返回 `{ ok:false, reason:'sms_unavailable' }`,前端 `PublicClaim.tsx` 提示"短信暂不可用,请联系门店店员手动核销"
- 管理员在 `VoucherClaimsAdminPanel`(已存在)中可手动把 claim 标记为 `claimed`,无需 OTP

## 技术细节(TC3 签名实现要点)

```text
1. CanonicalRequest = HTTPMethod + "\n" + CanonicalURI + "\n" + CanonicalQueryString
                    + "\n" + CanonicalHeaders + "\n" + SignedHeaders + "\n" + HashedRequestPayload
2. StringToSign = "TC3-HMAC-SHA256\n" + Timestamp + "\n"
               + Date + "/sms/tc3_request\n" + sha256(CanonicalRequest)
3. SigningKey = HMAC(HMAC(HMAC(HMAC("TC3"+SecretKey, Date), "sms"), "tc3_request"))
4. Signature = HMAC-SHA256(SigningKey, StringToSign)
5. Authorization: TC3-HMAC-SHA256 Credential=.../sms/tc3_request,
                  SignedHeaders=content-type;host, Signature=...
```

必需 header:`X-TC-Action: SendSms`、`X-TC-Version: 2021-01-11`、`X-TC-Region: ap-guangzhou`、`X-TC-Timestamp`、`Authorization`、`Content-Type: application/json; charset=utf-8`、`Host: sms.tencentcloudapi.com`

## 执行顺序

1. 你先在腾讯云完成签名/模板审核(等待期 1-2 天),拿到 5 个值
2. 我用 `add_secret` 工具弹窗让你录入
3. 录入完成 → 我改写 `send-sms/index.ts` → 部署 → 走 OTP 实流程测试

## 不在本次范围

- 国际短信(只支持 +86)
- 短信批量群发、营销短信
- `/portal` 测试发送按钮
- 短信发送量统计/限流(腾讯云控制台自带)
