## 目标
新增用户对话框的"用户类型"目前只硬编码了「管理员 / 店员」两项，需要改为加载 `app_roles` 表中的全部角色（超级管理员、区域经理、店长、正式店员、兼职店员、实习生），并正确写入 `user_roles.role_code`。

## 改动

### 1. `src/components/admin/CreateUserDialog.tsx`
- 新增 `roles` state，打开对话框时和 shops 并行从 `app_roles` 拉取 `code, name`（按 `sort_order`）。
- 用 `roleCode` 状态替代旧的 `role: AppRole`，默认值取 sort_order 最大的"正式店员"或后端返回的第一个非管理类角色。
- `<Select>` 选项改成 `roles.map(...)`，显示中文名。
- 提交时把 `role_code` 传给 `admin-create-user`（不再传 `role`）。

### 2. `supabase/functions/admin-create-user/index.ts`
- BodySchema：`role` 字段改为可选的 `role_code: z.string().min(1)`；保留兼容旧客户端的 `role` 字段。
- 收到 `role_code` 后：
  - 查 `app_roles` 校验存在，并取出对应的 legacy 枚举映射：
    - `super_admin` / `area_manager` / `shop_manager` → `admin`
    - `staff` / `parttime` / `intern` → `anchor`
  - 删除 trigger 默认插入的行后，写入 `user_roles { role: <legacy>, role_code: <new> }`。
- 返回值带上 `role_code`。

### 3. 不动的部分
- `RoleEditor`（已经按 app_roles 列全部角色），`usePermissions`（已读 role_code）保持不变。
- `public-register` 暂不改，注册申请仍走 anchor 默认，由管理员审批后再调整角色。

## 验收
- 打开"新增用户"对话框，"用户类型"下拉显示 6 项：超级管理员 / 区域经理 / 店长 / 正式店员 / 兼职店员 / 实习生。
- 选择"店长"创建用户后，数据库 `user_roles.role_code = 'shop_manager'`，`role = 'admin'`，该用户登录后拥有 shop_manager 对应的权限集。
