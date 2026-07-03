## 目标
后台用户管理增加手机号显示与补录、缺失手机号强制补录、以及登录/操作日志。

## 一、后台用户表增加手机号列
`src/components/admin/UserTable.tsx`:
- `UserWithRole.profile` 增加 `phone`；`fetchUsers` 的 `profiles` 查询加 `phone`。
- 用户列展示手机号（若无则显示"未填写"红色标签）。
- 新增筛选 Tab：`missing_phone` 未填写手机号。
- `StaffProfileDialog` 内加入"手机号"字段，允许管理员直接补录（调用现有 `update_my_phone_realname` 需改造为 admin 版，或新增 RPC `admin_update_user_phone(_user_id, _phone, _real_name)`）。

`CreateUserDialog.tsx`：已支持手机号（保持）。

## 二、强制未填手机号用户补录
新建 `src/components/auth/RequirePhoneGate.tsx`：
- 登录后从 `profiles` 读取当前用户 `phone`；若为空则全屏遮罩弹窗，要求输入手机号 + 验证码（复用现有 `phone-login-send-otp` 的短信发码逻辑，但需要新增 `bind-phone-send-otp` / `bind-phone-verify` 边缘函数，写入当前登录用户的 `profiles.phone`）。
- 无法关闭，直到验证成功。
- 挂载在 `App.tsx` 已登录路由树最外层。

## 三、登录 / 操作日志
新建 `audit_logs` 表（迁移）：
```
id, user_id, actor_role_code, action(text), target_type, target_id, 
detail(jsonb), ip, user_agent, created_at
```
带 GRANT + RLS：仅管理员可读（`user_has_permission(auth.uid(),'user.manage')` 之类），任何认证用户可 INSERT 自己的记录；service_role 全权。

写入点：
- 登录：`useAuth.tsx` 的 signIn 成功回调，以及 `phone-login-verify-otp` 边缘函数返回后写 `action='login'`（渠道区分 password/phone）。
- 关键管理操作：`UserTable` 的 handleSuspend / handleDelete / handleRoleChange / 重置密码 / 编辑资料 / 创建用户 后写入。
- 封装 `src/lib/audit.ts` 提供 `logAudit(action, detail)`。

后台查询页：在 `Portal.tsx` 新增 Tab "操作日志"（`src/components/admin/AuditLogTable.tsx`）：
- 支持按用户、动作类型、日期区间筛选，分页查询。
- 展示时间、用户（真实姓名/手机号）、动作、目标、IP。

## 四、技术细节
- 迁移：创建 `audit_logs` + 索引 (user_id, created_at desc)、(action, created_at desc)。
- 新增 RPC `admin_update_user_phone(_user_id uuid, _phone text, _real_name text)`：SECURITY DEFINER，校验调用者具有 `user.create` 权限，唯一性校验。
- 新增边缘函数 `bind-phone-send-otp` 与 `bind-phone-verify`：写入 `phone_login_otp` 表；验证成功后调用 `update_my_phone_realname` 或直接更新 `profiles.phone`。

## 验证
- 后台表格看到手机号列、未填写筛选。
- 用无手机号账号登录 → 立即弹出补录框，验证通过后跳首页。
- 完成登录、暂停用户等操作 → "操作日志" Tab 出现记录。
