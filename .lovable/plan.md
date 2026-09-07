# 只读审计：总部（HQ）与跨店排班的结构现状

本条只做核查与契约建议，不改代码、不改数据、不赋角色、不做迁移。以下结论全部来自对当前后端的只读查询。

## 1. 现状核查结果

### app_bootstrap_v1
- 门店上下文只有一个来源：`staff_profiles.shop_id`（`SELECT ... INTO staff_row, current_shop_id FROM staff_profiles WHERE user_id = uid`）。没有任何按当日排班推导门店的逻辑。
- 该 `current_shop_id` 之后被用于：班次定义过滤、活动过滤、OKR 过滤。若为空，班次定义退化为"全部可见"，OKR 段直接跳过 → 总部账号呈现"未分配门店"。
- 返回的 `shifts` 只含 `work_date` + `shift_code`，**不含 `shop_id`**，所以即使排班在别的门店，前端也无法知道今天在哪家店。
- 角色只取一行：`ORDER BY created_at LIMIT 1`，多角色用户会被截断。

### 角色 / HQ 范围
- `app_roles`：super_admin(1)、area_manager(2)、shop_manager(3)、staff(4)、parttime(5)、intern(6)。**没有任何 HQ/总部专属 role_code，也没有"跨店范围"字段**（无 scope/shop 维度列）。
- 当前分布（计数）：super_admin 3、area_manager 2、staff 4、parttime 3、intern 3；suspended 均为 0。
- `user_roles` 唯一约束是 `(user_id, role)`，允许同一用户多行；`role_code` 无唯一约束，也无门店维度。
- 权限判定 `user_has_permission()` 完全与门店无关；门店隔离全靠 RLS 里另外拼的 `current_user_shop_id()`。

### ERP 身份映射
- `erp_user_links`：`erp_user_id`(PK) / `aigc_user_id`(unique, FK auth.users) / `phone` / `display_name` / `roles[]` / `permissions[]` / `shops`(jsonb) / `last_login_at`。
- 计数：3 条链接；`roles` 去重后只有 `super_admin`；`shops` 数组元素键为 `{id, name}`；**没有一条 shops 长度 > 1**，即多门店/总部范围目前从未从 ERP 落到 GO。
- `erp_user_links` 已启用 RLS 但**策略数为 0** → 仅 service_role 可读，任何前端/RPC（含 `app_bootstrap_v1`，它是 STABLE 非 SECURITY DEFINER）都读不到它。这是 HQ 桥接目前断链的关键点。
- `is_erp_user()` 是 SECURITY DEFINER，可判断"是不是 ERP 用户"，但不给门店范围。

### shift_schedules
- 列：`work_date`(date, NOT NULL)、`shift_code`(text, NOT NULL, 无 FK 到 shop_shifts)、`user_id`(NOT NULL)、`shop_id`(**可空**, FK shops ON DELETE CASCADE)、`source`(manual|ai)、`note`、`created_by`。
- **唯一约束 `UNIQUE (work_date, user_id)`** → 结构上**不支持同一人同一天在多门店或多班次**。这是硬阻塞，跨店当日双班无法录入。
- 计数：总 395 行，`shop_id` 为空 0 行；**90 行的 (user_id, shop_id) 与该员工 staff_profiles.shop_id 不一致**，即跨店排班已真实存在，只是 bootstrap 读不到。
- RLS SELECT：`user_id = auth.uid() OR has_role(admin) OR (staff.read 且 shop_id = current_user_shop_id())`。→ 无固定门店的总部账号若不是 legacy `admin`，`current_user_shop_id()` 为 NULL，**看不到任何他人排班**。写策略同理，`shop_id = current_user_shop_id()` 对总部恒为假。

### shop_shifts
- `start_time`/`end_time` 均为 `time without time zone`，无跨日标记列。计数：`end_time <= start_time` 的行为 **0**，即当前无跨午夜班次；跨午夜语义**未定义**，一旦录入将被下游按同日时间区间误判。
- `shop_id` 可空（NULL = 全门店），但当前 `shop_id IS NULL` 的行为 **0**，全部班次都绑定了具体门店。
- SELECT 策略允许 `shop_id IS NULL OR shop_id = current_user_shop_id()`；总部（NULL 门店）只能看到全局班次，而全局班次为 0 → 总部看到空班次表。

### 其他
- `staff_profiles.allowed_shop_ids` 存在，4 名员工已填多门店，但**只有排班生成函数用它**，RLS 与 bootstrap 都不认这个字段。
- 门店：active 3 家；staff_profiles 共 14 条，其中 1 条 `shop_id` 为空。
- `shops` SELECT 策略同样是 `admin OR id = current_user_shop_id()` → 总部看不到全部门店列表。

## 2. RLS 缺口清单（只陈述，不修改）

1. 全链路的门店判定函数只有 `current_user_shop_id()`，单值、只来自 staff_profiles，**没有"多门店集合"或"HQ 全域"概念**。
2. 总部只能靠 legacy `has_role(admin)` 绕过，等于把总部与超级管理员混为一谈，无法区分"看全部销售/排班"与"可改一切"。
3. `area_manager` 有角色但 RLS 里完全没有区域范围，实际权限退化为单店。
4. `erp_user_links` 零策略，ERP 下发的 `shops` 范围在 RLS 中不可用。
5. `shift_schedules.shop_id` 可空 + 无 `(work_date,user_id,shop_id,shift_code)` 维度约束，跨店当日多班既被唯一键禁止，又缺少针对空 shop_id 的兜底策略。
6. `shift_code` 无外键，跨门店同 code 不同含义时无法约束。

## 3. 建议的最小只读契约（GO ← ERP）

原则：门店范围由 **ERP 作为唯一权威**下发，GO 侧不新建后台管理界面，只消费。

**A. 身份桥接（读）**
- 扩展 `erp_user_links` 的语义即可，不新增身份表：`roles[]` 承载 ERP 角色（含 HQ 角色码），`shops` jsonb 承载可见门店列表，并新增一个显式的全域标记（如 `scope: 'hq' | 'shops'`），避免用"空数组"歧义表达总部。
- 增加一个 SECURITY DEFINER 只读函数 `current_user_shop_scope()`，返回 `{is_hq boolean, shop_ids uuid[]}`：HQ → is_hq=true；店长/店员 → ERP 下发门店 ∪ `staff_profiles.shop_id` ∪ `allowed_shop_ids`。所有 RLS 与 bootstrap 统一改用它，`current_user_shop_id()` 保留为兼容包装。

**B. 当天有效门店上下文（读）**
- `app_bootstrap_v1` 的 `shifts` 增加 `shop_id`、`shop_name`、`start_time`、`end_time`。
- 新增返回块 `shop_context`：`{ is_hq, home_shop_id, today_shop_ids[], effective_shop_id }`，其中 `effective_shop_id` = 当天排班门店优先，无排班时回退 `staff_profiles.shop_id`，HQ 则为 null 且 `is_hq=true`（前端据此渲染"总部/全部门店"而非"未分配门店"）。
- 班次定义、活动、OKR 的过滤条件从 `= current_shop_id` 改为 `is_hq OR shop_id = ANY(scope)`。

**C. 跨店排班可行性前提（需 ERP 侧确认后才谈改造）**
- 必须先决定是否允许同一人同日跨店/多班。若允许，`UNIQUE (work_date, user_id)` 必须让位给 `(work_date, user_id, shop_id, shift_code)`，并补"同日时间区间不重叠"的校验。
- 跨午夜班次需要显式语义：建议增加 `crosses_midnight boolean`（或以 `end_time <= start_time` 约定并在所有下游统一解释），当前 0 行跨午夜，是最低成本的定义时机。

**D. 归属 ERP 而非 GO 的事项**
- 角色与 HQ 范围的授予、门店归属、区域经理的辖区定义，全部在 ERP 维护并通过 SSO/JWT 与 `erp_user_links` 同步；GO 不新建角色后台，`/portal` 只做只读展示。
- GO 侧仅需消费三个只读原语：`is_erp_user()`、`current_user_shop_scope()`、`app_bootstrap_v1.shop_context`。

## 4. 本条未做

未修改任何函数、策略、约束或数据；未授予角色；未执行迁移。原生与 UI 由你负责。
