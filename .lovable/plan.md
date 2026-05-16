## 目标
在 Lovable 预览域名（`*.lovable.app` / `localhost`）下自动登录一个固定开发账号，省去每次手动输入。生产域名（`boomeroff.lovable.app` 等正式发布地址）保持现有登录流程不变。

## 方案

### 1. 准备开发账号
- 在 Lovable Cloud 用户里创建一个固定账号，例如 `dev@boomeroff.local` / 一个固定密码。
- 角色给 `admin`（方便编辑模式下测试所有功能），`suspended=false`。
- 账号的邮箱和密码通过 secrets 注入到前端：
  - `VITE_DEV_AUTOLOGIN_EMAIL`
  - `VITE_DEV_AUTOLOGIN_PASSWORD`
- 这两个值只在预览域名下读取，不会影响正式用户。

### 2. 修改 `src/hooks/useAuth.tsx`
在初始化 `getSession()` 之后加一段逻辑：

```text
if (没有 session
    且 hostname 命中 lovable.app / localhost / 127.0.0.1
    且 VITE_DEV_AUTOLOGIN_EMAIL/PASSWORD 都存在) {
  await supabase.auth.signInWithPassword({ email, password })
}
```

- 用 `sessionStorage` 标记 `dev-autologin-tried`，避免登录失败时进入死循环。
- 失败时打日志、回退到正常登录页，不阻塞 UI。

### 3. 安全边界
- 域名判断硬编码在前端：只在 `*.lovable.app` 或 `localhost` 触发，正式自定义域不会自动登录。
- 即便有人在生产环境拿到 env 值，也因为域名不匹配而不会自动执行。
- 仍保留显式 `signOut` 按钮，登出后下次刷新会再次自动登录（这是想要的效果）。

### 4. 不改动的部分
- 登录页 `Auth.tsx`、注册流程、权限/RLS、其他业务逻辑都不动。
- 正式访客和已登录用户行为完全不变。

## 需要你确认/提供
1. 开发账号的 **邮箱** 和 **密码**（我会用 add_secret 让你填，不会留在代码里）。
2. 是否同意这个账号默认是 `admin` 角色。

确认后我就执行：创建账号 + 加 secrets + 改 `useAuth.tsx`。