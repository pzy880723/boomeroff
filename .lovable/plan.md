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

**A. 身份桥接（读）— ERP 是唯一权限权威**
- 权限范围只认 ERP 下发：`erp_user_links.roles[]` 承载 ERP 角色码，`shops` jsonb 承载已授权门店，并新增显式范围标记（如 `scope: 'hq' | 'shops'`），不用"空数组"歧义表达总部。
- 明确否决"并集扩权"：**不采用** ERP 门店 ∪ `staff_profiles.shop_id` ∪ `allowed_shop_ids` 的自动合并。GO 本地的 `staff_profiles.shop_id` / `allowed_shop_ids` 仅作为**待迁移证据**保留（可在管理视图中列为"待 ERP 确认"），绝不隐式授予销售或排班的读取权限。
- 新增 SECURITY DEFINER 只读函数 `current_user_shop_scope()`，返回 `{ scope: 'hq'|'shops', shop_ids uuid[] }`，**数据来源仅为 ERP 授权映射**。ERP 未下发映射时返回空范围（fail-closed），由前端提示"权限未同步，请在 ERP 配置"，而不是回退到旧资料。
- 不为读取身份而开放 `erp_user_links` 整表：保持零策略 + service_role，仅通过上述 SECURITY DEFINER 函数暴露**最小非敏感字段**（scope、shop_ids、角色码）。`phone`、`display_name`、`permissions[]` 原文等个人/敏感字段不进入客户端。

**B. 当天有效门店上下文（读）— 不做归属回退**
- `app_bootstrap_v1` 的 `shifts` 增加 `shop_id`、`shop_name`、`start_time`、`end_time`。
- 新增返回块 `shop_context`：`{ scope, authorized_shop_ids[], today_shop_ids[], today_state, effective_shop_id }`。
- `today_state` 必须是显式枚举，**无排班时绝不把 `staff_profiles.shop_id` 当作今日工作门店**：
  - `scheduled` — 当天有排班，`effective_shop_id` = 排班门店（多店时 `today_shop_ids` 给全量，`effective_shop_id` 为 null，由 UI 让本人选择）。
  - `unscheduled` — 当天无排班（含休息日），`effective_shop_id` = null。
  - `rest` — 当天命中 `staff_day_offs` 或节假日全员休。
  - `hq` — 总部范围，无固定门店，看全部授权门店。
  - `unmapped` — ERP 未下发授权映射，属错误态，前端明示而非静默降级。
- `staff_profiles.shop_id` 在返回体中仅作为 `home_shop_hint`（历史资料）出现，标注为非授权、非今日上下文，供迁移核对；任何过滤逻辑不得使用它。
- 班次定义、活动、OKR 的过滤条件从 `= current_shop_id` 改为按 `scope`：HQ → 全部授权门店；其余 → `shop_id = ANY(authorized_shop_ids)`；`unmapped` → 不返回门店数据。
- 排班上下文与动作权限分离：`shop_context` 只回答"今天在哪家店/能看哪些店"，能否写排班、能否看销售仍由 ERP 权限位单独判定。

**C. HQ 范围与动作权限分离**
- 总部**不等于**超级管理员。需要两个正交维度：范围（HQ 全域 / 指定门店集合）与动作权限（读销售、读排班、写排班、写门店……）。
- 现状是靠 legacy `has_role(auth.uid(),'admin')` 绕过门店条件，等于把范围和最高动作权限绑死，必须拆开：RLS 条件形如 `范围命中 AND 动作权限命中`，HQ 只放宽范围，不放宽动作。
- `area_manager` 同理：辖区门店集合由 ERP 下发，动作权限单独判定。

**D. 跨店排班改造边界（本轮必做 / 待答）**
- **必做（无损）**：现有 395 条排班一行不改、不删；仅让"按日期读取跨店排班"成为可能——即 bootstrap 与查询按 `work_date` + 授权门店集合取数，而不是按 `staff_profiles.shop_id` 过滤。这不需要改任何约束。
- **待你回答**：是否允许同一人同日多店/多班。当前 `UNIQUE (work_date, user_id)` 结构性禁止；若要允许，需改为 `(work_date, user_id, shop_id, shift_code)` 并补同日时间区间不重叠校验。**在你答复前不改约束。**
- 跨午夜语义仍未定义（当前 0 行 `end_time <= start_time`），建议在改动前显式定义（新增 `crosses_midnight` 或统一约定），否则一旦录入将被下游误判。

**E. 归属 ERP 而非 GO 的事项**
- 角色授予、HQ 范围、门店归属、区域辖区，全部在 ERP 维护，经 SSO/JWT 与 `erp_user_links` 同步；GO 不新建角色后台，`/portal` 只读展示。
- GO 侧仅消费三个只读原语：`is_erp_user()`、`current_user_shop_scope()`、`app_bootstrap_v1.shop_context`。


## 4. 本条未做

未修改任何函数、策略、约束或数据；未授予角色；未执行迁移。原生与 UI 由你负责。
