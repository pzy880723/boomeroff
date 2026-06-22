## 问题诊断

数据库里确实出现了重复申请（活动 `47ef3992…`：`13564388627`、`13916289997` 各有 2 条记录）。三个原因叠加：

1. **`activity-apply` 去重判断有漏洞**：只有当"已有申请且已挂上 `voucher_claim.short_code`"时才返回已领取；只要旧记录的 claim 还没回写或查询失败，就会再插一条新申请 + 新券。同时没有数据库唯一约束兜底。
2. **`activity-feedback` 的 `lookup_by_phone` 用 `.maybeSingle()`**：一旦该手机号有多条记录就直接报错或返回 `null`，前端显示"未查询到您的领取记录"。
3. **再次扫码进入活动页时不会自动识别**：只读 `localStorage` 和 URL `?claim=`，换个浏览器/清缓存就当成新用户。

## 修复方案

### 1. 数据库（migration）
- 先合并历史重复：每个 `(activity_id, applicant_phone)` 只保留最早一条；如果它没有 `voucher_claim_id`，把后来那条的 claim 接过来；其余的 application 删除（保留 `voucher_claims` 不动，避免影响用户已领的券，但解除外键关联）。
- 加唯一索引：`CREATE UNIQUE INDEX activity_applications_activity_phone_uniq ON activity_applications(activity_id, applicant_phone);`，从根上杜绝重复。

### 2. `supabase/functions/activity-apply/index.ts`
- 不论旧记录是否带有 short_code，都视为"已申请"，按下列逻辑处理：
  - 旧记录已有 claim → 直接返回 `already:true` + `short_code`。
  - 旧记录还没 claim（异常情况）→ 现场为它补建一张 `voucher_claims` 并回写 `voucher_claim_id`，再返回。
- 把 `applicant_phone` 查询的 `.maybeSingle()` 改成 `order(created_at asc).limit(1)`，避免多行导致报错。
- 插入失败若命中新加的唯一约束（错误码 `23505`），回退到"查已有记录并返回"的分支，保证并发也不会重复。

### 3. `supabase/functions/activity-feedback/index.ts`
- `lookup_by_phone` 改成按 `created_at desc` 取最新一条，并支持"有申请但还没 claim"的场景（这时也告诉前端 `found:true`，让用户跳到反馈/补发页或提示"已报名，正在出券"）。

### 4. `src/pages/public/PublicActivity.tsx`
- 报名表单的手机号字段失焦时，自动调用 `lookup_by_phone`：命中就直接切到反馈模式（显示已领的 short_code），不再让用户重复填表。
- "我已领取过 → 输入手机号查询"弹窗保留，作为补救入口；同时把按钮文案在主表单上方做一行小提示："已报名过？换个浏览器/重新扫码也能用手机号找回 →"。

### 5. 部署 & 验证
- 部署 `activity-apply`、`activity-feedback` 两个 edge function。
- 用现有 `13564388627` 走一遍：重复提交应返回 `already:true`；`lookup_by_phone` 应返回原 short_code；扫码进入填手机号失焦应自动跳反馈页。

## 影响范围
- 仅活动报名/查券链路；不动券核销、活动管理列表。
- 数据清理只删除"多余 application 行"，已发放的 `voucher_claims` 不删（保留用户已领的优惠券）。
