
## 问题定位

**1. 登录页多余文案**
`src/components/auth/AuthPage.tsx` 使用了默认 `variant='card'` 的 `LoginForm`，而 `LoginForm` 在 card 模式下会渲染 `CardTitle "登录"` 与 `CardDescription "登录您的账户以继续"`——这就是你看到的「登录您的账户」「以继续」多余标题。

**2. 手机验证码登录失败**
查了后台日志和数据库,原因已经明确:

- OTP 表 `phone_login_otp` 显示你刚刚 04:20 那条验证码已经成功核销(`used_at` 有值,`attempts=0`),说明我们自己的 edge function `phone-login-verify-otp` 一切正常。
- 但紧接着 Supabase Auth 的 `/verify` 接口返回了 **400: `Only the token_hash and type should be provided`**。
- 原因在 `src/components/auth/PhoneLoginForm.tsx` 第 59-63 行:
  ```ts
  supabase.auth.verifyOtp({ type: 'magiclink', email: data.email, token_hash: data.token_hash })
  ```
  当使用 `token_hash` 模式时,Supabase Auth **不允许同时传 `email`**,只能传 `{ type, token_hash }`。edge function 里那个 `email` 字段其实用不上,是历史残留。

后台强制补录手机号那一步是我们自己的 RPC,不走 Supabase Auth 的 `/verify`,所以能过——这跟这里的失败并不矛盾。

## 修改方案

### 1. 精简登录页 UI —— `src/components/auth/AuthPage.tsx`
- 给 `<LoginForm>` 传 `variant="embedded"`,直接去掉 Card 标题和描述,只保留 Tab 下方的「用户名 / 密码」表单本体。
- 副标题一行(`APP_BRAND_TAGLINE · AI 识物…`)保持不动;真正的「登录您的账户以继续」来自 Card,已随 embedded 模式一并去掉。

### 2. 首页整体居中、去掉上下滑动条 —— `src/components/auth/AuthPage.tsx`
- 外层容器已经是 `min-h-screen flex items-center justify-center`,已经居中。但 `overflow-hidden` + 内容高度过大在小屏(390×598)下仍会溢出,所以把根容器改为 `h-[100dvh] overflow-hidden`,并把内部卡片的内边距/图标尺寸略微压缩(logo `h-16 w-16`、卡片 padding `p-4`、Tab 与表单间距 `mb-3` / `space-y-3`),确保 iPhone 竖屏首屏内一屏放下,无滚动条。
- 底部 mode 切换(注册/忘记密码)保留链接式按钮,不引入额外滚动。

### 3. 修复手机验证码登录 —— `src/components/auth/PhoneLoginForm.tsx`
把 verifyOtp 调用改为:
```ts
const { error: eV } = await supabase.auth.verifyOtp({
  type: 'magiclink',
  token_hash: data.token_hash,
});
```
去掉 `email` 字段。这样 `/verify` 就不会再报 400。

其余逻辑不动:仍然由 `phone-login-verify-otp` 校验短信验证码 → 生成 `token_hash` → 前端 `verifyOtp` 建立会话 → 写入 audit log → 跳 `/`。

### 4. 兜底提示优化(轻量)
`PhoneLoginForm` catch 分支已经用 `toast.error(e.message)`,修复后 400 不再出现。同时把 `invokeFn` 抛出的错误也保留原样,方便后续排查。

## 影响面
- 仅前端两个文件 + UI 微调;不动数据库、不动 edge function、不改 RLS。
- 账号密码登录、注册、忘记密码流程不受影响。
- 修复后此前已登记的手机号(比如你后台补录过的那批)都能正常通过验证码登录。
