## 现状诊断

排查后发现三块全部存在系统性问题，不是单点 bug：

### 1. 权限清单不全、命名与实际功能脱节
当前 `app_permissions` 只有 17 条，但 `/portal` 一共有 12 个功能模块、几十个具体操作。导致：
- 「门店管理」「班次设置」「闲鱼行情」「纠错审核」「用户管理（增删改、改密、停用）」「角色与权限」等模块**根本没有对应的权限键**，只能用 `role.manage` 一条兜底。
- 「门店 SOP / 顾客 Q&A」只有 read/write 两条，没区分类目管理、AI 生成等子动作。
- 区域经理的"区域"概念（`user_roles.area_code`）从未在前后端被使用。

### 2. 前端没有按权限隐藏入口
`src/pages/Portal.tsx`：
- `MENU_GROUPS` 直接渲染**所有 Tab**，没有根据 `usePermissions().can()` 过滤。
- 顶部只有一行"非 admin 警告"提示，但点进去仍可操作。
- `UserTable` / `CreateUserDialog` / `RoleEditor` / `ScheduleManager` 内部按钮也没做 `can()` 判断。

所以"区域经理可以点开角色与权限"完全是 UI 没拦——后端 RLS 才是最后一道闸。

### 3. 后端 RLS 仍写死 legacy `has_role(uid,'admin')`
看现有 RLS：`shift_schedules / shop_shifts / shop_holidays / shop_kb_* / staff_profiles / staff_day_offs / shops / app_settings / official_knowledge / products / price_records / community_posts(delete) / invitations` 全都用 `has_role(uid,'admin')`，只认 legacy enum=`admin`（即超级管理员）。

后果：
- 区域经理（enum=`anchor`, role_code=`area_manager`）尽管在 `app_role_permissions` 里被勾选了 `schedule.manage / staff.manage`，**写排班/读员工档案直接被 RLS 拒绝**。
- 这就是"明明能排班，但员工列表里看不到其他人"的真正原因——`staff_profiles` 的 SELECT 策略只允许 `self OR admin`，区域经理拿不到别人的档案，`ScheduleManager` 里 `users` 数组就只剩自己（甚至空）。
- 类似地，区域经理改不了门店 SOP、改不了班次、加不了节假日。

---

## 修复方案

### Step 1 — 重建权限清单（数据库迁移）

按现有模块完整拆分权限键，删掉无用的、补齐缺失的。新清单（按 group 分组）：

```text
人员
  user.read           查看用户列表
  user.create         新建用户
  user.update_role    修改用户角色
  user.suspend        停用/启用用户
  user.reset_password 重置用户密码
  staff.read          查看员工档案
  staff.write         编辑员工档案

门店
  shop.read           查看门店列表
  shop.write          管理门店（增删改）

排班
  schedule.view_self  查看自己排班
  schedule.view_shop  查看本店排班
  schedule.write      手动排班
  schedule.ai         AI 智能排班
  schedule.clear      清空排班
  shift.write         管理班次
  holiday.write       管理节假日
  dayoff.write        管理员工禁排日

知识库
  shop.kb.read        查看门店 SOP / Q&A
  shop.kb.write       编辑门店 SOP / Q&A
  shop.kb.category    管理 SOP / Q&A 分类
  knowledge.official.read   查看官方知识
  knowledge.official.write  编辑官方知识
  knowledge.personal.write  写个人知识库

识别 / 商品
  recognition.use     使用 AI 识别
  product.create      新增商品
  product.edit        编辑商品
  product.delete      删除商品
  price.write         记录价格

社区
  community.post      发帖
  community.moderate  社区审核

系统
  settings.ai          AI 模型与提示词
  settings.recognition 识别管线设置（联网搜索等）
  xianyu.manage        闲鱼行情缓存管理
  correction.review    纠错审核
  role.manage          管理角色与权限
```

把旧的 17 条迁移成新清单（保留同名键，重命名/拆分新键），然后按以下默认矩阵重置 `app_role_permissions`：

| 角色 | 默认包含 |
|---|---|
| super_admin | 全部权限 |
| area_manager | 除 `role.manage / settings.ai / settings.recognition / xianyu.manage / user.update_role` 外的所有运营权限 |
| shop_manager | 本店运营：staff.read/write、schedule.*（不含 ai 全局）、shift.write、holiday.write、dayoff.write、shop.kb.*、recognition.use、product.*、price.write、community.post、knowledge.personal.write |
| staff | recognition.use、product.create/edit、price.write、schedule.view_self/view_shop、shop.kb.read、knowledge.personal.write、community.post |
| parttime | recognition.use、schedule.view_self、shop.kb.read |
| intern | recognition.use、schedule.view_self、shop.kb.read |

### Step 2 — 后端 RLS 全面替换

新增/复用 `user_has_permission(uid, perm_key)`（已有），把所有 `has_role(uid,'admin')` 写法替换为 `user_has_permission(uid, '<对应权限>')`。重点表：

- `staff_profiles` SELECT：`self OR user_has_permission(uid,'staff.read')`；ALL 写：`'staff.write'`
- `shift_schedules` SELECT 保持全员可读；ALL 写：`'schedule.write'`（AI 生成的 edge function 走 service-role 不受影响）
- `shop_shifts` ALL 写：`'shift.write'`
- `shop_holidays` ALL 写：`'holiday.write'`
- `shop_kb_categories` ALL 写：`'shop.kb.category'`
- `shop_kb_entries` ALL 写：`'shop.kb.write'`
- `staff_day_offs` SELECT：`self OR user_has_permission(uid,'staff.read')`；ALL 写：`'dayoff.write'`
- `shops` ALL 写：`'shop.write'`
- `app_settings` ALL 写：`'settings.ai' OR 'settings.recognition'`（拆两个策略）
- `official_knowledge` ALL 写：`'knowledge.official.write'`
- `community_posts` DELETE：`self OR 'community.moderate'`
- `invitations` / `user_roles` ALL 写：`'user.create' / 'user.update_role' / 'user.suspend'`（按动作拆）
- `xianyu_price_snapshots` DELETE：`'xianyu.manage'`

注意：`community_posts.is_public` 等读策略保持不变，避免影响游客模式。

### Step 3 — 前端按权限隐藏入口

改造点：

1. **`src/pages/Portal.tsx`**
   - 给每个 `MenuItem` 增加 `perm: PermissionKey` 字段。
   - 用 `usePermissions().can(perm)` 过滤 `MENU_GROUPS`（空 group 整组隐藏）。
   - 默认 `tab` 取**第一个有权限的 item**，避免空白页。
   - 渲染区域加 `{can(item.perm) ? <Component /> : <NoPermission />}` 二次防护。
   - 删掉「当前账号不是管理员」那个误导性 Alert，改成"无权限页"组件。

2. **按钮级 gate**（按相关权限包一层 `can(...)`）：
   - `UserTable`：改角色 / 停用 / 重置密码 / 删除分别绑 `user.update_role / user.suspend / user.reset_password / user.create`
   - `CreateUserDialog`：`user.create`
   - `ScheduleManager`：AI 排班按钮 → `schedule.ai`；清空 → `schedule.clear`；格子 +/× → `schedule.write`
   - `ShiftSettingsPanel` / `ShopManager` / `KbManager` / `OfficialKnowledgeManager` / `XianyuCacheManager` / `AISettingsPanel` / `CorrectionReviewPanel` / `CommunityModeration` 同理
   - `RolePermissionManager`：保存/删除/新建按钮 → `role.manage`

3. **路由级 gate**：
   - `PortalGuard` 已经有"密码"门，但应再加一层：`can('user.read') || can('shop.write') || …` 任意一个为 true 才允许进 `/portal`，否则重定向回首页 + toast。

### Step 4 — `usePermissions` 类型补齐

`PermissionKey` 联合类型按 Step 1 新清单更新，避免 TS 漏检。

---

## 技术细节

- 迁移采用 `BEGIN; ... COMMIT;` 一次性：① 删旧 `app_permissions` 行 → ② 插入新行 → ③ `TRUNCATE app_role_permissions` → ④ 按默认矩阵 INSERT → ⑤ 替换所有 RLS policy（先 DROP 同名再 CREATE）。
- `user_has_permission` 已经是 SECURITY DEFINER，可直接在 USING/WITH CHECK 中调用，不会引发 RLS 递归。
- `ScheduleManager` 不需要改业务代码——`staff_profiles` SELECT 策略放开后，区域经理就能看到该门店所有员工。
- 老的 `role` enum (`admin`/`anchor`) 在 `user_roles` 里继续保留写入，兼容已有 `has_role(uid,'admin')` 的少量遗留逻辑（如 `exp_on_*` 触发器里"管理员不加经验"的判定保留不动）。
- `area_manager` 的"区域"过滤本期不实现（`area_code` 字段保留），等门店列表里加上"区域"再做，避免把范围扩太大。
- 受影响文件预估：
  - 1 个 SQL 迁移
  - `src/hooks/usePermissions.tsx`（PermissionKey 类型）
  - `src/pages/Portal.tsx`、`src/pages/PortalGuard.tsx`
  - `src/components/admin/` 下约 10 个组件加 `can()` 判断
  - 不动 `src/integrations/supabase/types.ts`（自动生成）

完成后效果：区域经理登录 `/portal` 只看到他真正有权限的 Tab，能正常做排班并看到本店所有员工，但点不到也调不到角色与权限、AI 设置等。
