## 优惠券：修改、删除、有效期显示与过期核销保护

### 1. 删除规则（管理员端）

在 `VoucherDetailDialog` 增加"删除"按钮（红色，二次确认）。

**可删除条件**（前端 + 后端双重校验）：
- 不存在任何"仍可能被核销"的 claim — 即没有任何 `voucher_claims` 满足：
  - `status IN ('unclaimed','claimed')` 且 (`expires_at IS NULL` 或 `expires_at > now()`)
- 已 `redeemed` / `expired` / `void` 的历史 claim 不阻止删除（它们已无法再核销）。
- 兜底：完全没有领取记录的券随时可删。

**实现**：
- 前端按钮：先用 `select('id', count: 'exact', head: true)` 统计阻塞 claim 数；为 0 才弹删除确认，否则 toast 提示"还有 N 张未到期的券未核销，请等到期后再删"。
- DB：写一个 SECURITY DEFINER RPC `delete_voucher_safe(_id uuid)`，里面再次校验同样条件，通过后把仍残留的过期/已核销/已作废 claim 一起 DELETE，再删除 `vouchers` 行；任意一项不满足就 RAISE EXCEPTION '有未到期且未核销的券，无法删除'。RPC 仅放给 `voucher.manage` 权限调用。

### 2. 编辑保留 + 给用户的提示

`VoucherEditDialog` 编辑模式继续可用。仅在管理员端 `VoucherDetailDialog` 顶部加一条小字提示：

> 修改"抵扣金额/门槛/有效期天数"只影响**新发放**的券；已发放的券保持原有规则与到期时间。

（因为 `voucher_claims.expires_at` 是在领取时由 trigger 按当时的 valid_days 落库的，本身已是快照，不需要 DB 改动。）

### 3. 有效期显示（时间范围 + 剩余天数），两端同步

新建公共组件 `src/lib/voucher.ts`：

```ts
formatValidityRange(claim): { rangeText, remainingText, expired }
// 已领取/已核销：rangeText = "YYYY-MM-DD ~ YYYY-MM-DD"（claimed_at ~ expires_at）
// 未领取：rangeText = "领取后 N 天内有效"
// remainingText: 未过期 → "剩 X 天"（< 1 天显示 "剩 X 小时"）；过期 → "已过期 N 天"
```

**显示位置**：
- `PublicClaim.tsx`（用户领券页）券面区：替换现有单行"有效期至..."，改为两行：
  - `2026-06-12 ~ 2026-07-12`
  - `剩 28 天`（过期时红色"已过期"）
- `VoucherRedeem.tsx`（店员核销页）：同样替换"有效期至"为完整 range + 剩余天数 Badge。
- `VoucherDetailDialog` 领取记录列表里：每条 claim 额外加一行小字 `2026-06-12 ~ 2026-07-12 · 剩 28 天 / 已过期`。
- `VouchersMine.tsx` 列表卡片：模板层面仍显示"有效期 N 天"（模板没有具体日期）。

### 4. 过期 = 不可核销（已部分实现，补全 UI）

- `voucher-redeem` edge function 已校验 `expires_at < now()` 返回"该券已过期" ✅，无需改。
- `VoucherRedeem.tsx`：当 `status === 'claimed'` 但 `expires_at` 已过，禁用"确认核销"按钮，显示"该券已过期，无法核销"红字卡片（前端先拦截，避免发请求才报错）。
- 可选优化：DB 不自动把状态写成 expired（保持现状，按 expires_at 判断即可），避免引入定时任务。

### 5. 涉及文件

- `src/lib/voucher.ts` — 新增 `formatValidityRange` 工具
- `src/components/voucher/VoucherDetailDialog.tsx` — 删除按钮 + 修改提示
- `src/components/voucher/VoucherEditDialog.tsx` — 不动（已支持编辑）
- `src/pages/public/PublicClaim.tsx` — 有效期显示
- `src/pages/VoucherRedeem.tsx` — 有效期显示 + 过期前端拦截
- `src/pages/VouchersMine.tsx` — 列表小字（可选保留现状）
- 数据库迁移：新增 `delete_voucher_safe(uuid)` RPC

### 验证

- 创建一张券 → 不发放 → 详情页"删除" → 成功消失。
- 创建一张券 → 定向发放一张 unclaimed → 删除 → 应被拒绝并提示"还有未核销的券"。
- 等该 claim 过期（或手工把 expires_at 置过去）→ 重试删除 → 成功。
- PublicClaim 领取后查看券面：显示 `日期1 ~ 日期2` 和 `剩 X 天`。
- 过期券扫码核销页：按钮禁用，提示红字。