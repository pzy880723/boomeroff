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
  "status": "scheduled" | "rest" | "unscheduled" | "unconfigured",
  "effective_shop": { "id": "uuid", "name": "上海中信泰富店" } | null,
  "authorized_shops": [ { "id": "uuid", "name": "上海中信泰富店" } ],
  "reason": "no_erp_mapping" | "suspended" | "no_authorized_shop"   // 仅 unconfigured 时出现
}
```

- 有效门店只来自**当天排班**（且必须落在授权门店内），永不回退历史归属。
- 总部无固定门店：`scope=hq`、`effective_shop=null`（除非总部本人当天也有排班）。

## 2. 排班只读接口

```
rpc: list_shift_schedules_v1(_from date = 今天, _to date = _from, _shop_id uuid = null)
```

- 区间上限 31 天，超出报 `22023 range exceeds 31 days`；`_shop_id` 不在授权范围报 `42501 shop not authorized`。
- 总部（或有 `schedule.view_shop` / `staff.read` 的门店范围账号）：授权门店内全部员工排班。
- 其他账号：只返回本人排班（可跨门店、跨日期）。

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
  }]
}
```

## 3. 其他只读原语

- `current_user_erp_scope()` → `{ scope, shop_ids[], role_codes[], erp_linked, reason? }`（脱敏，不含手机号/姓名/权限原文）
- `erp_authorized_shop_ids()` → `uuid[]`（RLS 使用）
- `is_hq_user()` → boolean
- `current_shop_context_v1()` → 同 `shop_context`
- `erp_verify_current_scope_v1()` → ERP 侧用固定 issuer 的用户令牌调用，回 `{ authenticated, user_id, is_erp_user, scope_context, shop_context }`；客户端不放 service key。

全部函数已 `REVOKE ... FROM PUBLIC, anon`，仅 `authenticated` 可执行。

## 4. RLS 现状

`shops` / `shop_shifts` / `shift_schedules` / `shop_kb_entries` / `shop_kb_categories` / `shop_holidays` / `staff_day_offs` / `staff_profiles` / `operation_okrs` 的读取条件新增 `shop_id = ANY(erp_authorized_shop_ids())`（总部或带对应权限时生效）。既有 legacy 条件保持不变以兼容尚未接入 ERP 的账号。

## 5. 待迁移（当前缺身份映射的安全方案）

现状：`erp_user_links` 仅 3 条且全部 `super_admin`，其余 11 名员工无 ERP 映射，`scope=unconfigured`。
建议迁移顺序（不改历史数据）：
1. ERP 侧为每名在岗员工下发映射（`aigc_user_id` 或 `erp+<uuid>@aigc.boomeroff.local` 邮箱确定性匹配），带 `roles[]` 与 `shops[{id,name}]`。
2. 观察 `current_user_erp_scope()` 全员非 `unconfigured` 后，再逐表移除 legacy 条件（`current_user_shop_id()`），届时 `staff_profiles.shop_id` 降级为纯资料。
3. 在此之前不要删除 legacy 条件，否则未映射账号会立刻失去门店数据。
