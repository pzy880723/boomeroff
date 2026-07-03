## 诊断
上一轮虽然写了 `PhoneLoginForm.tsx` 并做了后端/Edge Function 支持，但**没有把它挂进 `AuthPage`**——所以线上/预览看到的登录页依旧是旧样子：
- Logo 下仍显示 `BOOMER GO / 门店运营系统 · AI 识物 · 知识共享 · 排班管理`
- 只有账号密码表单，没有「账号密码 / 手机验证码」Tab

Header Logo、`useAuth` 沙盒判断、`LoginForm` 成功后 `navigate('/', {replace:true})` 均已到位，无需再动。

## 改动文件
`src/components/auth/AuthPage.tsx`

## 具体改动
1. **移除 Logo 下方文字**：删掉 `<h1>{APP_BRAND_NAME}</h1>` 与 `<p>...tagline...</p>`，仅保留 Logo（略微下移间距）。
2. **登录态引入 Tab**（复用 shadcn `Tabs`）：
   - Tab A「账号密码」→ 现有 `<LoginForm />`
   - Tab B「手机验证码」→ 已存在的 `<PhoneLoginForm />`
   - Tab 只在 `mode === 'login'` 时显示；忘记密码 / 注册 分支保持不变。
3. Tab 外套一个白色圆角卡片（`bg-card border rounded-2xl p-4 shadow-soft`），与 App 视觉一致。

## 不改
- 后端 Edge Functions / RPC / `phone_login_otp` 表（已就绪）
- `LoginForm` / `PhoneLoginForm` / `RegisterForm` / `ForgotPasswordForm` 内部逻辑
- `useAuth` 沙盒自动登录判定
- Header Logo 显式尺寸与背景

## 验证
1. 预览打开 `/`（未登录）→ 登录页 Logo 下无任何文字；出现「账号密码 / 手机验证码」两个 Tab；切换 Tab 表单正确渲染。
2. 用手机验证码登录成功 → 直接跳 `/`（首页）。
3. 发布后线上不再触发自动登录、不再闪现兜底页面。
