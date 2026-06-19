## 需求拆解

1. **去除「待领取」中间态** — 后台一旦生成优惠券/二维码,就是「待核销」。不再要求收券人填姓名+手机+短信验证码。
2. **券模板从列表删除后,已发出的二维码仍可核销** — 删除只是把模板从管理列表移除,既有 claim 仍然有效。
3. **只有管理员可删除模板**(普通账号即使有 `voucher.manage` 也不行;走 `has_role(uid,'admin')` 或 `super_admin`)。

---

## 1. 数据模型与状态简化

- `voucher_claims.status` 保留 `claimed / redeemed / expired / void`,**移除 `unclaimed`**。
- `vouchers` 增加软删字段:`deleted_at timestamptz`。删除即 `UPDATE vouchers SET deleted_at = now()`,**不删 claim**。
- `vouchers` 列表查询全部加 `.is('deleted_at', null)` 过滤。
- 核销链路(`voucher-redeem`)仍可走 `voucher_claims → vouchers` join,即使模板被软删也能查到。

### 迁移 SQL
- `ALTER TABLE vouchers ADD COLUMN deleted_at timestamptz`
- 把现存 `unclaimed` 的 claim 一次性升级:`UPDATE voucher_claims SET status='claimed', claimed_at=COALESCE(claimed_at, created_at) WHERE status='unclaimed'`
- 重写 `delete_voucher_safe(_id uuid)`:
  - 鉴权改为 `has_role(uid,'admin') OR has_role(uid,'super_admin')`(via role_code)
  - 改为软删:`UPDATE vouchers SET deleted_at=now(), active=false WHERE id=_id`
  - 不再 block(因为既有 claim 都允许保留)
  - 返回 `{ ok: true }`
- `voucher_claims_set_expires` 触发器中由 `claimed_at` 触发 expires_at 计算 — 已存在,无需改;新创建时直接带 `claimed_at=now()` 走流程。

## 2. 后端边缘函数调整

- `voucher-claim-create`:
  - 直接创建时 `status: 'claimed'`、`claimed_at: now()`、`recipient_*` 可空。
  - 这条 claim 立刻可被核销;返回 `short_code` 用于二维码。
- `voucher-redeem`:
  - 删掉 `if (claim.status === 'unclaimed') return ...`。
  - 不再校验模板是否被软删(即使 `deleted_at` 也允许核销);保留过期/作废校验。
- `voucher-claim-send-otp` / `voucher-claim-accept`:**保留代码但不再被调用**(避免破坏旧数据,但前端入口去掉)。
- `activity-apply` 已经写 `status: 'claimed'`,无需改。

## 3. 前端调整

### `src/lib/voucher.ts`
- `CLAIM_STATUS_LABEL`/`CLAIM_STATUS_VARIANT` 去掉 `unclaimed` 项。
- `VoucherClaim.status` 类型去掉 `'unclaimed'`。

### `src/components/voucher/VoucherDetailDialog.tsx`
- `tryDelete` 不再前置查 claim 数量,直接弹确认。
- 删除按钮只在 `isAdmin`(由 `useAuth().role === 'admin'` 或权限 `has_role admin` 判断)时显示;否则隐藏。
- 列表里 `c.status === 'unclaimed'` 复制短链分支:替换条件为 `c.status === 'claimed' && !c.redeemed_at`(已生成、未核销均可复制短链)。

### `src/pages/public/PublicClaim.tsx`
- 移除姓名/手机/OTP 表单。
- 直接展示二维码(若 `claim.status === 'claimed' && !expiredNow`)。已核销/过期/作废沿用现有提示。
- `voucher-claim-status` 已返回 `claim` 含 `short_code` 与 `code`,可直接用于 `QrCanvas` + 文案。

### 其它引用
- `VoucherRedeem.tsx`、`PublicClaimByPhone.tsx` 等含 `unclaimed` 分支的位置改为按 `claimed` 处理或移除该分支。
- `voucher-claim-by-phone` 函数 `.in('status', ['unclaimed','claimed'])` 改为 `.in('status', ['claimed'])`。

## 4. 权限判定

前端 `VoucherDetailDialog` 通过 `useAuth().role === 'admin'` 显示删除按钮;后端 `delete_voucher_safe` 严格用 `has_role(uid,'admin')` 兜底,前端任何绕过都会被服务端拒绝。

## 5. 文件清单

**迁移**
- 新建 `supabase/migrations/<ts>_voucher_unclaimed_removal.sql`
  - `ADD COLUMN deleted_at`
  - `UPDATE voucher_claims` 升级旧状态
  - `CREATE OR REPLACE FUNCTION delete_voucher_safe`(改鉴权 + 软删)

**编辑**
- `src/lib/voucher.ts`
- `src/components/voucher/VoucherDetailDialog.tsx`
- `src/pages/public/PublicClaim.tsx`
- `src/pages/VoucherRedeem.tsx`
- `src/pages/public/PublicClaimByPhone.tsx`(如有 unclaimed 引用)
- `src/pages/VouchersMine.tsx` 等优惠券列表页(加 `.is('deleted_at', null)`)
- `supabase/functions/voucher-claim-create/index.ts`
- `supabase/functions/voucher-redeem/index.ts`
- `supabase/functions/voucher-claim-by-phone/index.ts`

**保留不动**
- `voucher-claim-send-otp` / `voucher-claim-accept`(不再触发,但保留以兼容历史)

---

## 一个需要确认的点

**直接发放(direct)模式下,后台输入"姓名/手机"还要不要?**

A. **完全不填**:发放即生成匿名 claim + 二维码/短链,谁拿到谁能核销(最纯粹按你说的"管别人有没有领"逻辑)。
B. **可选填写**:后台想记录就填,不填就匿名(保留对账能力,但流程仍是一步到位)。

我倾向 **B**(默认行为不变,前台仍可填名字电话备注;后端不要求,不发短信),如果你认可,我按 B 实施。如果你要 A 直接说一声。
