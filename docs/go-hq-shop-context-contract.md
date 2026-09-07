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


## 6. ERP 授权镜像刷新（GO 侧兼容准备，已上线；短租约默认关闭）

### 6.1 冻结的两边契约

ERP 端点（GO 主动拉）：`POST https://boomer-off-buddy.lovable.app/api/public/sso/aigc-scope`
- 头：`x-erp-sso-secret`（复用现有 `ERP_AIGC_SSO_SECRET`，GO 不新增 service key）
- 入参：`{ "erp_user_id": "<uuid>" }`
- 返回：`{ ok: true, data: { erp_user_id, active, revoked, roles: string[], permissions: string[], scope_version: int, updated_at, shops: [{ go_shop_id, erp_location_id, name }] } }`
- 门店只从 **active `go_shop_location_links`** 翻译；翻不出必须显式报错，禁止静默丢弃。ERP 身份链接被撤销必须 `revoked: true`。

ERP 推送（保存/撤销后）：`POST <GO functions>/erp-scope-push`（`verify_jwt=false`）
- 头：`x-erp-sso-secret`（恒定时间比较）、可选 `x-erp-timestamp`、`x-erp-nonce`
- Body：`{ timestamp, nonce, data: <上面的 data 同构> }`（`timestamp`/`nonce` 也可放 header）
- 校验：`timestamp` ±5 分钟窗；`nonce` 落 `erp_scope_push_nonces` 真实去重，重复 → `409 duplicate_nonce` 且**不续租、不改镜像**。

GO 函数（供原生/Web 调用）：`POST <GO functions>/erp-scope-sync`（`verify_jwt=true`）
- 先 `auth.getUser()`，再按 canonical `erp_user_links.aigc_user_id = auth.uid()` 取 `erp_user_id`；**不接受客户端传入 erp_user_id**。
- 返回：`{ ok: true, data: <erp_verify_current_scope_v1() 原样 JSON>, sync: { status: "synced" | "pending" | "unlinked", code, scope_version?, lease_renewed? } }`
  - `unlinked`：`no_erp_mapping` / `ambiguous_mapping`（未绑定账号，不报错、不新建绑定）
  - `pending`：`erp_unreachable` / `erp_http_<code>` / `sso_secret_missing` / `invalid_shop_mapping` 等，UI 显示「待同步」，**不得宣称已生效**
  - `synced`：`applied` 或 `lease_renewed`

### 6.2 版本与事务规则（`erp_apply_scope_mirror_v1(_erp_user_id, _payload, _mode)`，仅 service_role）

行级 `FOR UPDATE`，规则：
- 映射不存在 → `no_mapping`，**永不 INSERT 新绑定**。
- `in < cur` → `stale_version`（旧版本不覆盖）。
- `in = cur` 且内容一致：`pull` → `lease_renewed`（可信主动核验可延长租约）；`push` → `noop_same_version`（不续租）。
- `in = cur` 且内容不一致 → `version_conflict`。
- `in > cur` → 写入；`revoked || !active` 写墓碑 `link_status='revoked'` + `revoked_at`，**保留 canonical `aigc_user_id`，不删行**；墓碑只能由严格更高版本且未撤销的可信 payload 恢复。
- `scope_synced_at` 一律 `now()`（服务端时间），不接受任何传入时间。

### 6.3 短租约（**当前关闭**）

`app_settings.erp_scope_lease = {"enabled": false, "seconds": 60}`。开启后 `current_user_erp_scope()` 对已治理账号读写共用 60 秒租约，`scope_synced_at` 为空或过期 → `unconfigured / scope_stale`。`scope_synced_at IS NULL` 的豁免只是过渡态，不是最终态；等 ERP 端点 + 原生刷新真实验收后再置 `enabled: true`。

### 6.4 客户端刷新

Web：登录成功、冷启恢复会话、回前台/窗口聚焦时调用 `erp-scope-sync`，30 秒节流（`src/lib/erpScopeThrottle.ts`），失败静默。原生由 App 侧接线，同一节流约定。

### 6.5 尚未启用 / 依赖项

- `ERP_AIGC_SSO_SECRET` 在本项目 Edge Function 环境**尚未配置**：`erp-scope-push` 现返回 `500 server_misconfigured`（fail closed），`erp-scope-sync` 返回 `sync.status = "pending" / sso_secret_missing`，不影响现有权限。
- ERP `/api/public/sso/aigc-scope` 尚未上线，暂不做任何真实拉取，现有 3 个总部账号的角色与绑定未被改动。
- 短租约开关保持关闭；新 shops 结构解析已生效，但只在镜像里出现 `go_shop_id` 时启用，旧结构走原逻辑，总部账号不受影响。


## 7. 最小接入（最终版，2026-09-07 收尾）

不新增 ERP service-role，不复制 SSO 密钥。

### 7.1 拉取通道（已切换）

`GET https://erp.boomeroff.com/api/public/go/authorization`
- 头：`Authorization: Bearer <调用者本人的 GO JWT>`（由 `erp-scope-sync` 原样转发），**不带任何 SSO secret**。
- `redirect: "error"` + 响应 origin 复核（非 `https://erp.boomeroff.com` → `erp_origin_mismatch`），杜绝 token 随跳转外泄。
- ERP 侧固定 GO issuer，用无参 verifier 核验本人可信 `erp_user_id`；GO 旧 scope / 租约过期 / 已撤销也必须能刷新。
- 返回沿用既有 payload；GO 仍严格解析并核对 `data.erp_user_id` 与本地 canonical 一致（不一致 → `erp_user_id_mismatch`，不写镜像）。
- 网络/超时/HTTP 错误：**只记录 `sync_error`，绝不写镜像、绝不续租**。

### 7.2 回执 RPC（新增）

`erp_scope_sync_receipt_v1()`：无参、只读、`SECURITY DEFINER`、仅 `authenticated`/`service_role` 可执行，只读本人行。
返回 `{ authenticated, user_id, erp_user_id, scope_version, link_status, scope_synced_at, code }`，
`code ∈ ok | no_erp_mapping | ambiguous_mapping | unauthenticated`。
撤销墓碑仍可读回执（`link_status: "revoked"`），不要求 scope 活跃；不暴露他人数据、不含任何密钥；客户端无法写入这些字段。

### 7.3 ACK

镜像 `applied` 或同版本可信 pull `lease_renewed` 之后，`erp-scope-sync` 用同一本人 GO JWT 调用
`POST https://erp.boomeroff.com/api/public/go/authorization-ack`，body `{}`。
ERP 自行反查 GO receipt 核验版本/状态/60 秒新鲜度后才确认 outbox，不采信客户端的 ok。
ACK 失败：本地新权限已生效，但 `sync.status = "ack_pending"`，后续同版本 pull 会再次尝试 ACK；缺 ACK 一律不当成功。

### 7.4 `erp-scope-push`

保留、未配置 `ERP_AIGC_SSO_SECRET`、不启用（现返回 `500 server_misconfigured`，fail closed）。不新增任何密钥。

### 7.5 Web 刷新与 bootstrap 顺序（本次修复）

- 新增「仅前台 + 已登录」的 30 秒续租定时器（`startErpScopeRenewTimer`），登出 / 切后台 / 组件卸载即停；与 `focus`/`visibilitychange` 共用 30 秒节流 + in-flight 复用去重，不会重复打请求。
- 可信同步（`synced` 或 `ack_pending`）完成后强制重拉 `app_bootstrap_v1`，ERP 改角色后 UI 不会继续用旧 bootstrap。
- 迟到响应保护：发起时的 `userId` 与当前账号不一致（切号/登出）一律丢弃，绝不套用到新账号。
- 受 ERP 治理的账号在撤销/失效时：清掉本地缓存角色后重拉；`app_bootstrap_v1` 失败时**不再回退** `user_roles` 或缓存旧 admin，角色置空（fail closed）。
- 未被 ERP 治理的旧账号（11 名未绑定）：`unlinked` 不清角色、不重拉、不扩权，维持原有过渡权限。
- 测试：`tests/erp-scope-refresh.test.ts`（12 项，含假定时器真实推进 30/90/120 秒、后台与登出停表、dispose 后不再触发、节流去重、sync→bootstrap 顺序、迟到响应、撤销 fail closed）+ `tests/erp-scope-contract.test.ts`（11 项 payload/nonce）。
