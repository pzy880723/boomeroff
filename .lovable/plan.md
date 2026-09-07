# GO ↔ ERP 授权镜像收尾：最小落地契约（只读方案，不改生产数据）

## 现状（已只读核对）

- `erp_user_links` 只有 3 行，均为 HQ（roles `["super_admin"]`、permissions `["aigc_access"]`），canonical `aigc_user_id` 由 `erp-aigc-session` 严格保留（按 `erp_user_id` 唯一映射优先，冲突 409，绝不改写已存在的 canonical）。
- 这 3 行的 `shops` 目前是 `[{id: 7111b585-…, name: 中信泰富店}]`，`id` 是 ERP inv_location 编号，与 GO `shops.id` 不同源。因为 3 人都是 HQ，走 `scope='hq'` 分支，不解析 shops，所以现在没暴露；一旦有门店员工绑定就会整份 `invalid_shop_mapping`。
- `current_user_erp_scope()` 已经是严格 fail-closed（停用/歧义/撤销/非法或停用门店 → `unconfigured`）。缺的只有一件事：**镜像何时刷新**。原生登录只走 GO 手机号+密码，不重跑 SSO，所以 ERP 改角色后 GO 镜像可以无限期停留在旧值。
- `erp_governed_users` 只增不减，撤销后表现为 `mapping_revoked`，never-linked 的 11 名员工不受任何影响（保持既有旧 Web 兼容分支）。

## 方案要点（两边最小改动）

三条链路，共用一把已存在的 `ERP_AIGC_SSO_SECRET`，**不需要新增 GO service key、不需要改 verifier RPC 签名**。

### 1. 拉（GO 主动刷新，唯一必须项）

新增 GO Edge Function `erp-scope-sync`（`verify_jwt = true`）：

1. 用调用者 JWT `auth.getUser()` 确认身份；
2. 只按 canonical `erp_user_links.aigc_user_id = user.id` 取 `erp_user_id`（歧义/无映射直接返回 `unauthorized`，绝不按手机号/姓名/邮箱猜）；
3. 带 `x-erp-sso-secret` 调 ERP 新端点 `POST /api/public/sso/aigc-scope`，只传 `{ erp_user_id }`；
4. ERP 返回的 roles / permissions / shops 用 service role 写回镜像行（只 UPDATE 已有行，永不 INSERT 新映射）；
5. 返回 `erp_verify_current_scope_v1()` 的结果，原生可直接接线。

原生调用时机：登录成功后、App 冷启/回前台、进入排班或门店写操作前（可节流，例如 60 秒内不重复拉）。

### 2. 推（ERP 保存/撤销后即时失效，推荐但非阻断）

新增 GO Edge Function `erp-scope-push`（`verify_jwt = false`，用同一把 secret + `timestamp` + `nonce` 校验，5 分钟时间窗防重放）：ERP 在角色、门店、启停、离职保存成功后调用一次。GO 收到后只更新已存在的映射行；`revoked: true` 时删除 `erp_user_links` 行并保留 `erp_governed_users`，账号立即变 `mapping_revoked` 而不是回落旧 GO 权限。推送失败不阻断 ERP 保存——下一次拉取会补上。

### 3. 过期即失效（保证"失败 ≠ 永久旧权限"）

`erp_user_links` 增加 `scope_synced_at`、`scope_version`、`sync_error`。`current_user_erp_scope()` 增加新鲜度判断：

- `scope_synced_at` 超过 **15 分钟** → 写动作一律拒绝（`reason = 'scope_stale'`）；
- 超过 **12 小时** → 读也降为 `unconfigured`，即彻底 fail-closed。

ERP 不可达时是"降权"，不是"沿用旧权限"，也不会回落 legacy 分支。never-linked 账号不受新鲜度约束。

### 4. shops 契约切换

按你已确认的新结构解析：`[{ go_shop_id, erp_location_id, name }]`，GO 只信 `go_shop_id`，任一元素缺字段/格式非法/未知/已停用 → 整份 `invalid_shop_mapping`。旧 `{id}` 结构不再接受（3 个 HQ 走 hq 分支，不受影响）。

## 需要 ERP 新增的东西（明确清单）

1. `POST /api/public/sso/aigc-scope`，`x-erp-sso-secret` 鉴权，入参 `{ erp_user_id }`，返回：
   `{ ok, data: { erp_user_id, active, revoked, roles[], permissions[], scope_version, updated_at, shops: [{ go_shop_id, erp_location_id, name }] } }`，
   门店只从 **active 的 `go_shop_location_links`** 翻译；翻译不出来的 location 必须显式报错，不要静默丢弃。
2. 上述 push 回调（角色/门店/启停/离职保存后触发，含同样 payload + `timestamp`/`nonce`）。
3. `scope_version` 单调递增，GO 用它做幂等，乱序推送不覆盖新值。
4. ERP 侧不得依据手机号/姓名新建映射；建立新绑定仍必须走 `erp-aigc-session` 的 SSO 票据链路（canonical `aigc_user_id` 由 GO 保留）。
5. 11 名未绑定员工在 ERP 侧显式发绑定入口，GO 这边不自动关联、不改他们现有权限。

## 交付顺序

1. GO 侧先加字段与新鲜度判断（对 3 个 HQ 无影响，因为首次同步会即时写入）；
2. ERP 上线 scope 端点后接 `erp-scope-sync`，做一次真实拉取回验；
3. 最后接 push；
4. 全流程用 ROLLBACK 事务测：HQ 正例、ERP 降 staff 后写/读均拒绝、撤销后 `mapping_revoked`、镜像过期后拒绝、never-linked 保持原状。

本轮只提方案，不改生产角色、映射、历史数据，也不动原生 UI。
