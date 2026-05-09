
## 当前问题（已在代码 / 日志中确认）

### 1. 管理员"新增用户"完全失败
`supabase/functions/admin-create-user/index.ts` 调用了 `userClient.auth.getClaims(token)`，但项目使用的是 `@supabase/supabase-js@2.45.0`，该版本**不存在 `getClaims` 方法**。

边缘函数日志连续报错：
```
TypeError: userClient.auth.getClaims is not a function
```
导致管理员在 /portal 里点"新增用户" → 永远 500 失败。

### 2. "忘记密码"功能实质上不可用
- 用户注册时只填用户名，系统拼接成假邮箱 `username@boomeroff.local`（不存在的域名）。
- `ForgotPasswordForm` 调用 `supabase.auth.resetPasswordForEmail(email)`，要求用户输入邮箱，但用户根本没有真实邮箱，重置邮件也发不出去。
- 这个入口对店员而言是死链，会让人以为系统坏了。

### 3. 待审核用户登录后的提示极易误导
`useAuth.fetchUserRole` 一旦发现 `suspended=true`，弹的 toast 是 **"您的账号已被暂停，请联系管理员"**。但新注册用户首次登录时也会触发这条逻辑（注册即默认 suspended=true 等待审核），让人以为账号"被封"。同时 `LoginForm` 已先弹了"登录成功"，紧接着又弹"账号已被暂停"，两条 toast 自相矛盾。

### 4. 登录失败提示不够清晰
`LoginForm` 把所有失败都说成"请检查用户名和密码"。当用户名根本没注册时，给的提示和密码错完全一样，新用户排查困难。

---

## 修复方案

### A. 修复 admin-create-user（核心 bug）
`supabase/functions/admin-create-user/index.ts`：
- 去掉 `userClient.auth.getClaims(token)`，改用 `userClient.auth.getUser(token)` 拿到 `callerId`（这是 v2.45 支持的稳定 API，本项目其他位置也是这么用的）。
- 其他逻辑（admin 校验、createUser、role 调整）保持不变。

### B. 重做"忘记密码"入口
既然账号是用户名而非真邮箱，邮件链路本身行不通。改成：
- `ForgotPasswordForm` 不再调 `resetPasswordForEmail`，改成纯提示页：
  > 本系统使用用户名登录，忘记密码请联系管理员在「用户管理」中重置。
  保留"返回登录"按钮。
- `LoginForm` 中"忘记密码？"链接保留，但点击后展示上面的提示卡片即可，不再要求输入邮箱。
- 同步在 `UserTable` 行操作里增加 **"重置密码"** 项：调用一个新的边缘函数 `admin-reset-password`，由管理员输入或自动生成新密码后展示给管理员转告员工。
  - 新建 `supabase/functions/admin-reset-password/index.ts`：admin 校验 + `admin.auth.admin.updateUserById(userId, { password })`。
  - 前端 `ResetUserPasswordDialog` 弹窗：填入新密码 → 成功后显示提示。

> 说明：`/reset-password` 页面留作未来真实邮箱用户的兜底，不删除。

### C. 修复登录 / 待审核提示
- `useAuth.fetchUserRole`：检测到 `suspended` 时，区分"待审核"和"被暂停"。最简单的做法 —— 始终用 **"账号待管理员审核通过后方可登录"** 这条更友好的文案；管理员手动暂停时同样适用，语义不冲突。
- `LoginForm.handleSubmit`：登录成功后**不再立刻**弹"登录成功"。改为：
  - `await signIn(...)` 成功后，等待 `useAuth` 完成角色拉取再决定。
  - 实现方式：`signIn` 后不弹 toast，由 `Scan` / 路由层在 `loading=false && user` 时再展示欢迎 toast；或者更简单，直接去掉"登录成功" toast（页面会自然跳转到主界面）。
- 这样待审核用户只会看到那一条"待审核"的提示，不会自相矛盾。

### D. 登录失败文案更准确
`LoginForm`：捕获到 supabase 错误时，把 `Invalid login credentials` 翻译成"用户名不存在或密码错误"，其他 error 透传 `error.message`。

---

## 涉及改动文件

技术细节区：
- `supabase/functions/admin-create-user/index.ts`：`getClaims` → `getUser`。
- `supabase/functions/admin-reset-password/index.ts`：**新建**，admin 校验 + `updateUserById`。
- `src/components/admin/ResetUserPasswordDialog.tsx`：**新建**，admin 给员工设新密码的弹窗。
- `src/components/admin/UserTable.tsx`：菜单加入"重置密码"。
- `src/components/auth/ForgotPasswordForm.tsx`：改成"请联系管理员"提示卡片，移除邮箱输入和 `resetPasswordForEmail` 调用。
- `src/components/auth/LoginForm.tsx`：移除"登录成功" toast；登录失败时给出区分性的中文提示。
- `src/hooks/useAuth.tsx`：suspended 时的 toast 文案改为"账号待管理员审核通过后方可登录"。

不动：数据库 schema、`handle_new_user` 触发器、RLS、`public-register` 流程、`/reset-password` 页面。

---

## 验收

1. 管理员在 /portal 新建用户 → 成功创建并出现在列表中。
2. 新用户自助注册 → 登录看到"待审核"友好提示，不会再看到"已被暂停"。
3. 管理员通过审核 → 用户重新登录可正常进入。
4. 用户忘记密码 → 提示联系管理员；管理员在用户列表点"重置密码" → 输入新密码 → 用户用新密码登录成功。
5. 用错误密码登录 → 提示"用户名不存在或密码错误"。
