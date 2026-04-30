## 目标

把管理后台的"邀请成员"流程改为最简单的直接新增用户：管理员只需填**用户名 + 密码 + 用户类型**，提交即可创建用户，无需邀请链接、邮箱验证或注册流程。

## 实现方案

### 1. 新增 Edge Function: `admin-create-user`

客户端 SDK 的 `signUp` 会把当前管理员登出，所以必须用 Service Role Key 在服务端创建用户。

- 文件：`supabase/functions/admin-create-user/index.ts`
- 验证调用者 JWT，确认是 `admin` 角色（用 `has_role`）
- 入参：`username`（字符串，作为登录账号）、`password`（≥6位）、`role`（`admin` | `anchor`）
- 用 zod 校验入参
- 由于 Supabase Auth 需要 email，将 `username` 转为内部邮箱：`{username}@boomeroff.local`
- 调用 `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: username } })` —— `email_confirm: true` 跳过验证邮件
- `handle_new_user` 触发器会自动创建 profile 和默认 `anchor` 角色；若选择 `admin`，再 upsert 到 `user_roles` 把角色改为 `admin`（先删后插或直接 update）
- 返回创建结果；失败时（如用户名已存在）返回 400 + 中文错误
- 包含 CORS headers
- `supabase/config.toml` 中无需特殊配置（默认 `verify_jwt = false`，函数内自行校验）

### 2. 改造登录逻辑

`src/components/auth/LoginForm.tsx` 当前应该是用邮箱登录。改为支持"用户名"输入：
- 登录时把用户输入的用户名拼成 `{username}@boomeroff.local` 后调用 `signInWithPassword`
- 如果输入已经包含 `@`，则按原值传入（兼容已有邮箱账号）
- UI 文案改成"用户名"

（先确认 LoginForm 当前实现，再做最小改动）

### 3. 替换 InviteDialog → CreateUserDialog

- 新文件：`src/components/admin/CreateUserDialog.tsx`
- 表单字段：
  - 用户名（Input，必填，建议提示"仅字母数字，登录用"）
  - 密码（Input type=password，必填，≥6位，含显示/隐藏切换）
  - 用户类型（Select：管理员 / 主播）
- 提交：`supabase.functions.invoke('admin-create-user', { body: {...} })`
- 成功后 toast 提示"用户已创建"，关闭弹窗，触发用户列表刷新
- `src/pages/Portal.tsx` 把 `<InviteDialog />` 替换为 `<CreateUserDialog />`，按钮文字改为"新增用户"

### 4. 保留/清理

- 保留 `invitations` 表和 `/invite/:code` 路由不动（不破坏旧链接），但管理后台不再生成新邀请
- `InviteDialog.tsx` 可以保留文件以防后续需要，或删除（建议删除以保持简洁）

## 用户流程

管理员进入 `/portal` → 用户管理 → 点"新增用户" → 填用户名（如 `zhangsan`）+ 密码 + 选"主播" → 提交 → 立即创建，新用户可直接用 `zhangsan` + 密码登录。

## 安全要点

- Edge Function 必须先验证调用者是 admin，否则任何登录用户都能创建管理员
- 用 zod 校验长度和字符（用户名建议 `^[a-zA-Z0-9_]{3,32}$`，密码 ≥6）
- Service Role Key 只在 Edge Function 内使用，不暴露到客户端
