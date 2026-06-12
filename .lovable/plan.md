## 排查结论

Do I know what the issue is? 是的。

当前失败不是手机号、模板 ID、SDKAppID 或签名算法问题；后端实际发给腾讯云的签名已经被读坏了：

```text
宝暮上海品���管理
```

这个 `���` 是 Unicode 替换字符，说明运行时环境变量里的中文签名存在编码损坏。腾讯云收到的签名内容和控制台已审核签名不一致，所以返回：

```text
FailedOperation.SignatureIncorrectOrUnapproved
```

## 修复方案

1. **改后端短信函数的签名读取逻辑**
   - 保留现有 `TENCENT_SMS_SIGN_NAME`。
   - 新增优先读取 `TENCENT_SMS_SIGN_NAME_B64`。
   - 如果存在 Base64 版本，就在后端用 UTF-8 解码成中文签名再发给腾讯云。
   - 这样绕开中文 secret 被平台/复制粘贴链路损坏的问题。

2. **同步修复短信测试函数显示配置**
   - `/portal → 短信测试` 显示后端“最终实际使用的签名”。
   - 同时显示签名长度和 Unicode 编码点，方便确认不再出现 `���`。

3. **新增后端自检字段**
   - 发送失败时返回：
     - 使用的是普通签名还是 Base64 签名
     - 签名长度
     - 是否包含 `�`
   - 不暴露密钥，只暴露腾讯短信签名本身和诊断信息。

4. **设置新的运行时配置**
   - 把正确签名 `宝暮上海品牌管理` 存成 Base64：

```text
5a6d5pqu5LiK5rW35ZOB54mM566h55CG
```

   - 新增 secret：`TENCENT_SMS_SIGN_NAME_B64`。
   - 后端优先使用它。

5. **验证**
   - 直接调用短信测试后端函数。
   - 如果返回签名为 `宝暮上海品牌管理` 且不含 `�`，但腾讯云仍报同错，则唯一剩余原因就是腾讯云控制台内该签名未通过、签名内容不是这 8 个字、或签名属于另一个短信应用。

## 需要改动的文件

- `supabase/functions/send-sms/index.ts`
- `supabase/functions/sms-test/index.ts`
- `src/components/admin/SmsTestPanel.tsx`

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>