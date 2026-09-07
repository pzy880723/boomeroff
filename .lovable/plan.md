# GO ↔ ERP 授权镜像收尾：冻结契约与切换次序（只读方案，本轮不做任何迁移）

## 现状（已只读核对）

- `erp_user_links` 只有 3 行，均为 HQ（roles `["super_admin"]`、permissions `["aigc_access"]`），canonical `aigc_user_id` 由 `erp-aigc-session` 严格保留（按 `erp_user_id` 唯一映射优先，冲突 409，绝不改写已存在 canonical）。
- 这 3 行的 `shops` 是 `[{id: 7111b585-…, name: 中信泰富店}]`，`id` 为 ERP inv_location 编号，与 GO `shops.id` 不同源。3 人都走 `scope='hq'` 分支不解析 shops，所以现在没暴露；一旦有门店员工绑定会整份 `invalid_shop_mapping`。
- `current_user_erp_scope()` 已严格 fail-closed（停用/歧义/撤销/非法或停用门店 → `unconfigured`）。唯一缺口是镜像刷新时机：原生只走 GO 手机号+密码，不重跑 SSO。
- `erp_governed_users` 只增不减；never-linked 的 11 名员工保持既有旧 Web 兼容分支，本方案不触碰。

## 冻结契约

### A. ERP 侧端点（复用现有 `ERP_AIGC_SSO_SECRET`，GO 不新增 service key）

`POST /api/public/sso/aigc-scope`，头 `x-erp-sso-secret`，入参 `{ erp_user_id }`，返回：

```json
{ "ok": true, "data": {
  "erp_user_id": "uuid",
  "active": true,
  "revoked": false,
  "roles": ["..."],
  "permissions": ["..."],
  "scope_version": 12,
  "updated_at": "2026-09-07T18:00:00Z",
  "shops": [{ "go_shop_id": "uuid", "erp_location_id": "uuid", "name": "中信泰富店" }]
}}
```

- 门店只从 **active 的 `go_shop_location_links`** 翻译；任一 location 翻不出 `go_shop_id` 必须显式报错，禁止静默丢弃。
- **ERP 侧身份链接被 revoke 也必须体现为 `revoked: true`**（不只是角色为空），GO 据此进入永久撤销状态。
- `scope_version` 单调递增。

### B. ERP 推送（保存/撤销后立即失效）

`POST <GO functions>/erp-scope-push`，`verify_jwt = false`，同一把 secret 鉴权，body 为上面 `data` 的同构 payload 外加 `timestamp`、`nonce`。ERP 在角色/门店/启停/离职/链接撤销保存成功后调用一次。推送失败不阻断 ERP 保存。

### C. GO 侧函数

`erp-scope-sync`（`verify_jwt = true`）：
1. `auth.getUser()` 确认调用者；
2. **仅**按 canonical `erp_user_links.aigc_user_id = user.id` 取 `erp_user_id`，**不接受客户端传入 erp_user_id**，歧义/无墓碑记录直接 `unauthorized`；
3. 带 secret 调 A 端点，service role 写回镜像；
4. 返回 `erp_verify_current_scope_v1()` 结果，原生直接接线。

### D. 短租约（取代先前的读 12 小时/写 15 分钟宽限）

- 治理账号的读与写共用同一 **60 秒** 租约：`now() - scope_synced_at > 60s` → `reason='scope_stale'`，读写一律 fail closed。
- ERP 推送成功 = **立即失效并即时替换**；推送失败/端点不可达 = 原生显示"待同步"，最多到租约到期即拒绝，**不得宣称立即生效**。
- never-linked 过渡账号不受租约约束。

### E. 撤销用墓碑，不删行

- `erp_user_links` 不再 DELETE。增加 `link_status`（`active` / `revoked`）、`revoked_at`、`scope_synced_at`、`scope_version`、`sync_error`。
- 撤销 = `link_status='revoked'`，**保留 canonical `aigc_user_id`**，因此后续可信拉取仍能定位身份并恢复，无需用户输入 ERP ID。
- 幂等：`scope_version` 小于或等于已存版本的推送直接丢弃（乱序/重复同版本无副作用）；**永久撤销（ERP `revoked:true`）不可被任何旧版本 push 复活**，只能由更高 `scope_version` 且 `revoked:false` 的可信拉取/推送恢复。

### F. 防重放与鉴权卫生

- `timestamp` 在 ±5 分钟窗内，`nonce` 真实落库去重（唯一索引，保留 ≥ 24 小时后清理），重复 nonce 直接 409。
- secret 用**恒定时间比较**（`crypto.timingSafeEqual` 等价实现），任何日志/错误响应都不得出现 secret、token 或其片段。

### G. shops 解析

GO 只信新结构 `{ go_shop_id, erp_location_id, name }` 中的 `go_shop_id`；任一元素缺字段/格式非法/未知/已停用 → 整份 `invalid_shop_mapping` fail closed。员工缺映射 → 明确 `unconfigured`，不回落 legacy 门店。

## 切换次序（每步向后兼容，先加后切）

1. **GO 加字段与 edge（不启用租约）**：加 E 的列 + nonce 表，部署 `erp-scope-sync`、`erp-scope-push`，`scope_synced_at` 允许为空视为"不校验"。现有 3 HQ 完全不受影响。
2. **ERP 上线 A 端点**，GO 做一次真实拉取回验（HQ 正例 + 一个门店样例）。
3. **原生接入刷新时机**：登录后、冷启/回前台、进入排班或门店写操作前调用 `erp-scope-sync`（可 30 秒节流）。
4. **ERP 接 B 推送**，验证保存后即时失效。
5. **最后启用 60 秒短租约**（含 G 的 strict shops 解析），此时首批 HQ 的镜像已由可信端点拉取过，不做任何手工赋权。
6. 全流程用 ROLLBACK 事务测：HQ 正例、ERP 降 staff 后读写均拒、`revoked` 墓碑后 fail closed 且不可被旧版本复活、租约过期拒绝、重复 nonce 拒绝、never-linked 保持原状。

## 需要 ERP 明确承诺

- 端点 A + 推送 B（含 `scope_version`、`revoked`、`timestamp`、`nonce`）；
- 门店只经 active `go_shop_location_links` 翻译，翻不出即报错；
- 不按手机号/姓名建立映射；新绑定仍走 `erp-aigc-session` SSO 票据，canonical `aigc_user_id` 由 GO 保留；
- 11 名未绑定员工在 ERP 侧发绑定入口，GO 不自动关联、不改其现有权限。

本轮只冻结契约，不执行迁移、不改生产角色与映射、不动历史数据与原生 UI，也不恢复旧队列任务。
