## 一、部署后 Logo 丢失（Header 右上角）

**排查方向**：Header 用的是 `APP_BRAND_LOGO`（`src/assets/boomer-go-logo.png`）。生产构建下图片正常打包，但用户反馈线上不见。极可能原因：
1. Header 左侧点击区（logo）在小屏 949px 下被样式挤没；或
2. 生产环境 `<img>` 因 `crossorigin`/CDN 缓存导致 0 大小；
3. `boomer-go-logo.png` 没被 vite 打包（缺 asset json）。

**处理**：
- 打开线上页面用 devtools 抓 Header 图片请求，确认 404 / 尺寸 / CSS 隐藏；
- 若打包丢失 → 为该 png 生成 `.asset.json` 或改走 `assetSource`；
- 若样式问题 → 修正 Header 图片容器 min-w / display。

## 二、首次登录出现「打不开的兜底页面」

**根因假设**：
- `useAuth` 里有「预览域名自动登录」逻辑：在正式部署站点 `boomeroff.lovable.app`（也是 `.lovable.app` 结尾）也会触发，第一次登录后与用户手动登录形成竞态，触发一次错误状态；
- 或 Suspense fallback + `PublicErrorBoundary`/`ErrorBoundary` 在懒加载 chunk 首次拉取失败时闪现。

**处理**：
- 收紧「dev auto-login」判断，仅在 `id-preview--*.lovable.app` 或 localhost 生效，排除已发布的 `boomeroff.lovable.app`；
- 登录成功后主动 `navigate('/', { replace: true })`，避免落到需要相机权限或懒加载的路由造成兜底闪现；
- 给根路由加一层 `ErrorBoundary`，chunk 加载失败时提示"点击重试"而非白屏。

## 三、登录后默认跳转到首页

- 在 `LoginForm` / 手机验证码登录成功回调中调用 `navigate('/', { replace: true })`；
- `AuthPage` 也监听 `user` 变化，一旦有 session 就把浏览器地址推回 `/`。

## 四、登录页重设计

**视觉调整**：
- 移除 logo 下方文字（`APP_BRAND_NAME` 大标题 + `APP_BRAND_TAGLINE` 副标题）；只保留居中方形 logo，紧接着就是登录卡片；
- 登录卡片重排：Tab 切换「账号密码」/「手机验证码」，卡片圆角、阴影、间距整体收紧一档，配合红白主色。

**功能升级 —— 手机验证码登录**：
- 新增 Tab「手机验证码」：手机号输入框 + 「获取验证码」按钮（60s 倒计时）+ 6 位验证码输入框；
- 复用已有腾讯云短信通道（`TENCENT_SMS_*` 秘钥、`TENCENT_SMS_OTP_TEMPLATE_ID`）：
  - 新增/复用 Edge Function `phone-login-send-otp`：校验手机号是否已在白名单（见"第五节"），命中则下发验证码，写入 `phone_login_otp` 临时表；
  - 新增 Edge Function `phone-login-verify-otp`：校验 OTP，通过后用 Supabase Admin API 为该用户生成 magic-link/`signInWithOtp`-token 返回给前端，前端 `supabase.auth.setSession()` 完成登录；
- 未登记手机号：返回中文提示"该手机号尚未开通账号，请联系管理员"，不下发验证码。

## 五、后台用户字段：手机号 + 真实姓名

**数据库迁移**（在 build 模式确认后由 `supabase--migration` 执行）：
- `profiles` 表新增 `phone text unique`、`real_name text`；
- `phone` 建唯一索引，允许 null（未填写不影响老账号）；
- `handle_new_user` 触发器同步写入 raw metadata 里的 `phone` / `real_name`；
- 新增 `phone_login_otp` 表（`phone, code_hash, expires_at, attempts, used_at`）+ RLS 仅 service_role 可访问；
- 新增 `find_user_id_by_phone(phone text)` `SECURITY DEFINER` RPC 供 edge function 用。

**后台管理面板**：
- `CreateUserDialog` / `UserTable` / `StaffProfileDialog`：
  - 表单新增 "手机号"、"真实姓名" 字段（zod 校验 11 位中国手机号）；
  - 用户列表新增两列展示；
  - 编辑保存写入 `profiles`；
- 手机号是**手机验证码登录白名单**：只有 `profiles.phone` 中登记的号码才允许下发 OTP。

## 六、技术细节（面向开发）

```text
LoginTabs
 ├── PasswordTab (旧 LoginForm)
 └── PhoneOtpTab (新)
       ├─ POST edge/phone-login-send-otp {phone}
       │      → 查 profiles.phone 存在？→ 腾讯云 SMS → 存 phone_login_otp
       └─ POST edge/phone-login-verify-otp {phone, code}
              → 校验 OTP → admin.generateLink('magiclink') / signInWithOtp token
              → 返回 access/refresh token → 前端 setSession → navigate('/')
```

`useAuth`：
- `signInWithPhone(token)` 新增方法；
- dev-autologin 加 host 白名单排除 published 域。

## 七、交付顺序

1. 修 Header logo + 收紧 dev-autologin + 登录后 `navigate('/')`；
2. 数据库迁移：`profiles.phone/real_name` + `phone_login_otp` + RPC；
3. Edge Functions：`phone-login-send-otp` / `phone-login-verify-otp`；
4. 前端 `AuthPage` 重设计 + Tab 切换 + 手机登录组件；
5. 后台 `CreateUserDialog` / `UserTable` / `StaffProfileDialog` 加字段。

## 需要你确认的点

- 手机号仅限中国大陆 11 位（+86），是否需要国际区号选择？
- 未登记手机号是否要给"申请开通"入口（提交给管理员审核）？还是纯静默拒绝即可？
