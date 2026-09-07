# GO 服务端：总部/门店上下文与排班只读契约

权限权威：**ERP**（`erp_user_links`，仅服务端可读）。GO 不新增角色后台。
不使用 `staff_profiles.shop_id` / `allowed_shop_ids` 并集扩权；无可信 ERP 映射、停用、映射被撤销一律 fail-closed（`scope=unconfigured`）。
总部身份来自 ERP 显式角色（`super_admin`/`hq`/`headquarter`），**不由“空门店”推断**；总部只放宽可见范围，动作权限仍由 `user_has_permission()` 单独判定。

## 1. `app_bootstrap_v1()`（兼容旧字段，新增 `shop_context`）

新增字段：`shifts[].shop_id`（补足遗漏）、顶层 `shop_context`。

```jsonc
"shop_context": {
  "date": "2026-09-08",                 // 上海时区当天
  "scope": "hq" | "store" | "unconfigured",
  "status": "hq" | "scheduled" | "rest" | "unscheduled" | "unconfigured",
  "effective_shop": { "id": "uuid", "name": "上海中信泰富店" } | null,
  "authorized_shops": [ { "id": "uuid", "name": "上海中信泰富店" } ],
  "self_schedule": { "id": "uuid", "name": "上海中信泰富店" } | null,   // 仅参考，不代表身份
  "reason": "no_erp_mapping" | "mapping_revoked" | "ambiguous_mapping" | "suspended" | "no_authorized_shop"   // 仅 unconfigured 时出现
}
```

- 有效门店只来自**当天排班**（且必须落在授权门店内），永不回退历史归属。
- 总部**永远** `scope=hq`、`status=hq`、`effective_shop=null`；即使当天本人有排班也只出现在 `self_schedule`，不降级为门店身份。
- ERP 身份只按 `aigc_user_id` 精确匹配，取消邮箱兜底；出现多条匹配返回 `ambiguous_mapping`。
- 曾被 ERP 下发过映射的账号登记在 `erp_governed_users`；映射撤销/账号停用一律 `unconfigured`，**不回落** legacy 门店。

## 2. 排班只读接口

```
rpc: list_shift_schedules_v1(_from date = 今天, _to date = _from, _shop_id uuid = null)
```

- 区间上限 31 天，超出报 `22023 range exceeds 31 days`；`_shop_id` 不在授权范围报 `42501 shop not authorized`。
- 总部（或有 `schedule.view_shop` / `staff.read` 的门店范围账号）：授权门店内全部员工排班。
- 其他账号：只返回本人排班（可跨门店、跨日期）。
- 结果 UNION `staff_day_offs`：当天只有休息记录、没有班次时也返回一行 `is_rest=true`、`source=day_off`、`shift_code=null`；工作行优先，同一 `user_id + work_date` 绝不重复。
- 排序稳定：`work_date, user_id, shop_name`；同人同日多条工作行会在 `conflicts` 中报告。

```jsonc
{
  "date": "2026-09-08", "from": "2026-09-08", "to": "2026-10-08",
  "scope": "hq", "can_view_shop": true,
  "rows": [{
    "work_date": "2026-09-08", "shop_id": "uuid", "shop_name": "上海中信泰富店",
    "user_id": "uuid", "display_name": "珊珊",
    "shift_code": "A", "shift_name": "A 班",
    "start_time": "10:00:00", "end_time": "19:00:00",
    "source": "manual", "is_self": false, "is_rest": false
  }],
  "conflicts": [{ "work_date": "2026-09-08", "user_id": "uuid", "count": 2, "shop_ids": ["uuid","uuid"] }]
}
```

## 3. 其他只读原语

- `current_user_erp_scope()` → `{ scope, shop_ids[], role_codes[], erp_linked, reason? }`（脱敏，不含手机号/姓名/权限原文）
- `erp_authorized_shop_ids()` → `uuid[]`（RLS 使用）
- `is_hq_user()` → boolean
- `current_shop_context_v1()` → 同 `shop_context`
- `erp_verify_current_scope_v1()` → ERP 侧用固定 issuer 的用户令牌调用，回 `{ authenticated, user_id, erp_user_id, is_erp_user, scope_context, shop_context }`；客户端不放 service key。
  - `erp_user_id`：仅当本人存在**唯一且有效**的 ERP 映射（`erp_user_links.aigc_user_id = auth.uid()`，未停用、无歧义）时返回该 ERP 用户 ID（uuid）；歧义、撤销、停用、未映射一律返回 `null`（视为未授权）。绝不从用户可改的 email / user_metadata 推断 ERP 身份，也不开放 `erp_user_links` 整表读取。

全部函数已 `REVOKE ... FROM PUBLIC, anon`，仅 `authenticated` 可执行。

## 4. RLS 现状

`shops` / `shop_shifts` / `shift_schedules` / `shop_kb_entries` / `shop_kb_categories` / `shop_holidays` / `staff_day_offs` / `staff_profiles` / `operation_okrs`：
- 读取条件**只认** `shop_id = ANY(erp_authorized_shop_ids())`（+ 本人行、+ `shop_id IS NULL` 的全员公共内容），另加下方第 4.1 节的过渡分支。
- 原先的 `FOR ALL` 写策略会顺带放开读取，已拆分为 INSERT / UPDATE / DELETE 三条，且写入范围同样受 ERP 授权门店约束；总部范围与动作权限（`user_has_permission`）分离。
- 历史记录一条不删。

## 4.1 过渡兼容分支（仅限「从未被 ERP 治理」的旧账号）

目的：在 ERP 绑定入口交付前，避免在岗老员工突然失去旧 Web 功能。**只恢复其本轮改动之前既有的权限，不新增、不扩大门店。**

判定原语（均为 `SECURITY DEFINER`、`REVOKE FROM PUBLIC, anon`）：
- `legacy_transition_active()` = 已登录 **AND** `erp_governed_users` 从未登记 **AND** 当前 `erp_user_links` 无本人映射 **AND** 任一角色均未停用。
- `legacy_transition_shop_id()` = 上式成立时返回 `current_user_shop_id()`（旧 `staff_profiles.shop_id`），否则 `NULL`。
- `legacy_transition_admin()` = 上式成立 **AND** 旧 `admin` 角色。

边界（硬性）：
- 已映射、曾映射后被撤销（`erp_governed_users` 有登记）、任一角色停用 → 一律 `false`/`NULL`，绝不走旧分支。
- 旧分支与 ERP 授权互斥使用：ERP 已治理账号不会出现 legacy ∪ ERP 的并集扩权。
- 不按手机号 / 姓名 / 邮箱自动关联 ERP 身份。
- **新接口不受过渡影响，一律要求可信 ERP 映射**：`current_shop_context_v1()`（`scope=unconfigured`、`reason=no_erp_mapping`）、`erp_verify_current_scope_v1()`（`erp_user_id=null`）、`list_shift_schedules_v1()`（抛 `42501 erp mapping required: <reason>`，未映射账号连本人排班也不返回）。

验证（事务内执行并回滚，未改动任何数据）：

| 用例 | 结果 |
| --- | --- |
| never-linked 门店员工（旧属上海中信泰富店） | 旧表直接 SELECT 仅见本店：`shops`=1 行本店、`shop_shifts`=2、`shop_kb_entries`=26（含公共） |
| 同一账号调用新 RPC | `42501 erp mapping required: no_erp_mapping`；`current_shop_context_v1` = `unconfigured/no_erp_mapping`；`erp_verify_current_scope_v1.erp_user_id = null` |
| never-linked 且被停用 | `legacy_transition_active=false`，`shops` 可见 0 行 |
| 已映射账号（含旧 admin 角色） | `legacy_transition_active=false`，仅见 ERP 授权门店 |
| 映射被撤销（governed 仍在） | `legacy_transition_active=false`，`shops`=0，`reason=mapping_revoked` |
| never-linked 旧 admin | 恢复到本轮之前的旧 admin 可见范围（与改动前一致），新接口仍 `unconfigured` |

## 5. 待迁移（当前缺身份映射的安全方案）

现状：`erp_user_links` 3 条且全部 `super_admin`；共 15 个从未 ERP 治理且未停用的账号（其中在岗门店员工 11 名）走第 4.1 节过渡分支。
建议迁移顺序（不改历史数据）：
1. ERP 侧为每名在岗员工下发映射（只按可信 `aigc_user_id`），带 `roles[]` 与 `shops[{id,name}]`。
2. 映射下发即写入 `erp_governed_users`，该账号自动退出过渡分支，改由 ERP 授权判定。
3. 全员非 `unconfigured` 后，删除第 4.1 节的三个原语与相关策略分支，`staff_profiles.shop_id` 降级为纯资料。

