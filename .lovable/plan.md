## 目标

在登录页增加"注册账号"入口，新用户填**用户名 + 密码**即可提交，账号会被自动创建但默认处于"已暂停"状态。管理员在后台用户管理中点"恢复账号"即视为审核通过，用户随后可以登录。

## 实现方案

### 1. 新建 Edge Function: `public-register`

- 文件：`supabase/functions/public-register/index.ts`
- 公开调用，不要求 JWT（任何人都能注册）
- 入参：`username` (3-32 字母数字下划线)、`password` (≥6 位)、`display_name?`
- 用 zod 校验
- 用 Service Role 调 `auth.admin.createUser({ email_confirm: true })`，邮箱内部映射 `{username}@boomeroff.local`（与 `admin-create-user` 保持一致）
- `handle_new_user` 触发器自动创建 profile + 默认 anchor 角色
- 紧接着 `update user_roles set suspended=true, suspended_at=now() where user_id=<new>`
- 失败时返回中文错误（用户名已存在等）
- 包含 CORS

### 2. 前端注册表单

- 新建 `src/components/auth/RegisterForm.tsx`
  - 字段：用户名、密码、确认密码（含显示/隐藏切换）
  - 提交 → `supabase.functions.invoke('public-register', {...})`
  - 成功 → toast "注册成功，等待管理员审核" → 切回登录页
- 修改 `src/components/auth/AuthPage.tsx`：增加 `register` 模式
- 修改 `src/components/auth/LoginForm.tsx`：把底部"需要账户？请联系管理员创建"改成可点击的"注册账号"链接 → 切到 register 模式

### 3. 登录侧已有的 suspended 检测

`useAuth.tsx` 已经在 `fetchUserRole` 中检查 `suspended`：若为 true 则 toast "您的账号已被暂停，请联系管理员" 并自动登出。新注册用户尝试登录时会直接看到这个提示——刚好作为"等待审核"反馈，无需额外改动。

### 4. 管理后台增强

修改 `src/components/admin/UserTable.tsx`：

- 顶部加一个 Tabs/筛选：**全部 / 待审核**（待审核 = `suspended === true`）
- 待审核用户列表中，把"恢复账号"按钮提升为主操作，文案改为"通过审核"，更显眼
- 显示一个数字徽章，例如"待审核 (3)"

为简化：用 `<Tabs>` 切换 `filter: 'all' | 'pending'`，在前端过滤即可（数据已经全量拉取）。

### 5. 路由 & 安全

- `public-register` 不需要 `verify_jwt` 配置（默认 false，函数内不校验调用者身份）
- 不暴露 Service Role Key 到客户端
- 速率限制：暂不实现（保持简单）；如果后续被刷可加 IP 限频

### 6. 内存更新

更新 `mem://accounts/registration-and-invitation-model`：现在支持自助注册 + 管理员审核（恢复 suspended）。

## 用户流程

- **新用户**：登录页 → 点"注册账号" → 填用户名+密码 → 提交 → 提示"已提交，等待管理员审核" → 用户尝试登录会看到"账号已被暂停"
- **管理员**：进入 /portal → 用户管理 → 切到"待审核"Tab → 找到该用户 → 点"通过审核" → 用户即可登录
- **管理员直接创建**：仍可用现有的"新增用户"按钮，跳过审核，立即可用

## 文件清单

- 新增：`supabase/functions/public-register/index.ts`
- 新增：`src/components/auth/RegisterForm.tsx`
- 修改：`src/components/auth/AuthPage.tsx`（增加 register 模式）
- 修改：`src/components/auth/LoginForm.tsx`（增加注册入口）
- 修改：`src/components/admin/UserTable.tsx`（待审核筛选 + 通过审核按钮）
- 更新：`mem://accounts/registration-and-invitation-model`
