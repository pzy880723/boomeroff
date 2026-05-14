## 目标
把现有的"二选一角色（管理员/店员）+ 简单职位字段"扩展为一套**可配置的角色+权限系统**，内置常见的门店角色，并允许后台自定义新角色/调整权限。

## 现状梳理
- 数据库 enum `app_role` 只有 `admin` / `anchor`（=店员），所有 RLS、`has_role()`、UI 权限判断都基于这两个值。
- `staff_profiles.position` 已有 4 种职位（店长/正式店员/兼职/实习生），但只是展示标签，不参与权限。
- 没有"区域经理 / 门店运营"等概念，没有"按门店范围"的权限，也没法自定义新角色。

## 设计原则
1. **内置 6 种默认角色**，参考二手/中古连锁门店通行做法：

   | code | 名称 | 默认权限要点 |
   |------|------|------|
   | `super_admin` | 超级管理员 | 全部权限（含角色管理、账号审批、AI/知识库后台） |
   | `area_manager` | 区域经理 | 跨门店查看数据/排班/库存；可管理本区门店店员；不可改全局设置 |
   | `shop_manager` | 店长（门店运营）| 单门店全部业务权限：排班、知识库、社区审核、识别历史、价格、员工档案 |
   | `staff` | 正式店员 | 识别、上传、写社区、查看本店知识库与排班 |
   | `parttime` | 兼职店员 | 识别、查看本店排班、看知识库；不能改价格/不能加入官方知识库 |
   | `intern` | 实习生 | 仅识别 + 查看知识库 + 看自己的排班 |

   `admin` 旧值映射到 `super_admin`，`anchor` 映射到 `staff`，老数据不丢。

2. **权限粒度（permission key）**统一定义在前端常量 + 数据库表里，初版覆盖：
   - `recognition.use` 使用识别
   - `product.create` / `product.edit` / `product.delete`
   - `price.write`
   - `community.post` / `community.moderate`
   - `knowledge.personal.write` / `knowledge.official.write`
   - `schedule.view_self` / `schedule.view_shop` / `schedule.manage`
   - `shop.kb.write` / `shop.kb.read`
   - `staff.manage`（管理员工档案、审批账号）
   - `role.manage`（管理角色与权限本身）
   - `settings.ai`（AI 模型 / 联网搜索 / 闲鱼缓存等后台设置）

3. **数据范围（scope）**：每个用户可绑定 `shop_scope`（all / area / shop），由 `staff_profiles.allowed_shop_ids` + 新字段 `area_code` 提供。区域经理 = area；店长/店员 = shop；超管 = all。

## 数据库改动（一次迁移）

新建 3 张表（全部 RLS：读=登录用户，写=有 `role.manage` 权限）：
- `app_roles(code text PK, name text, description text, is_system bool, sort_order int)`
- `app_permissions(key text PK, name text, group text, description text)` — 内置数据 seed
- `app_role_permissions(role_code text FK, permission_key text FK, PRIMARY KEY (role_code, permission_key))`

调整 `user_roles`：
- 新增 `role_code text`（指向 `app_roles.code`），保留旧 `role` enum 字段做兼容；写入新数据用 `role_code`，老 enum 仅在 `super_admin/staff` 同步。
- 新增 `area_code text` 用于区域经理。

新建 SECURITY DEFINER 函数：
- `public.user_has_permission(_uid uuid, _perm text) returns boolean` — 替换今后大部分 `has_role(_, 'admin')`。
- 旧 `has_role()` 保留并在内部转换：`has_role(uid,'admin')` → `user_has_permission(uid,'staff.manage')` 这类等价桥接，确保旧 RLS 不破。

Seed：把上面 6 个角色 + 权限矩阵写入 `app_role_permissions`。

## 后台 UI（在 `/portal` 增加 "角色与权限" Tab）

新组件 `src/components/admin/RolePermissionManager.tsx`：
- 左侧：角色列表（含"+ 新建角色"，系统角色不可删，可改 name/描述但 code 锁死）
- 右侧：当前角色的权限矩阵（按 group 分组的 checkbox），保存即写 `app_role_permissions`。
- 顶部说明卡：解释每个权限 key 含义。

`UserTable.tsx`：
- "修改角色"下拉从枚举改成动态读 `app_roles`；同时多一列 `area_code`（区域经理才显示输入）。
- `RoleEditor.tsx` 接受动态角色列表 props。

`StaffProfileDialog.tsx`：去掉单独的 `position` 选项里跟角色重复的选项，改为提示"职位由角色决定"。

`CreateUserDialog.tsx` / `RegisterForm`：注册默认 `staff`，仍走 suspended 审批。

## 前端 hook 与权限判断
- 新 hook：`usePermissions()` —— 一次性读 `user_roles` + `app_role_permissions` 缓存到 React context，提供 `can(perm)`。
- 全项目搜索 `role === 'admin'` / `has_role` 的客户端用法（共约 17 个文件），逐个替换成 `can('xxx')`。RLS 仍然是最终防线。

## 不做的事
- 本期不引入"按门店逐条数据"的行级范围控制（会牵动太多 RLS）。范围只影响 UI 过滤与服务端 edge function；表级 RLS 维持现状。
- 不做权限继承/角色组合，一个用户一个角色。
- 不引入 Casbin 等外部库，方案足够轻量直接 SQL 实现。

## 落地顺序
1. 迁移 + seed（待你确认后执行）
2. `usePermissions` + 桥接旧 `has_role`
3. `/portal` 角色与权限管理 UI
4. `UserTable` / `RoleEditor` 动态化
5. 全项目替换 `role === 'admin'` 调用点
6. 文档化默认权限矩阵到 `mem://features/roles-permissions`

## 需要你确认
- 默认 6 种角色与权限分配是否 OK？特别是：
  - 兼职店员是否允许写社区？（草案：允许）
  - 实习生是否允许识别？（草案：允许，但不能加入知识库）
  - 区域经理是否能改价格？（草案：能看不能改）
- "门店运营"在草案里等于"店长 shop_manager"，要不要拆成两个独立角色（运营偏数据/排班，店长偏现场）？
