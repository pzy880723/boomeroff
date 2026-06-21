# 允许"活动尚未开始"也能报名

## 问题
当前两处都把"未开始"当成不可报名：

- `supabase/functions/activity-apply/index.ts`：`activity.starts_at > now()` 直接返回 `活动尚未开始`，报名被服务端拒绝。
- `src/pages/public/PublicActivity.tsx`：`notStarted` 分支渲染"活动尚未开始"卡片，根本不显示报名表单。

## 改动

### 1. `supabase/functions/activity-apply/index.ts`
- 移除 `starts_at > now` 的拒绝逻辑；**只保留** `ends_at < now` 与 `status !== 'active'` 的拦截。
- 其它逻辑不变。

### 2. `src/pages/public/PublicActivity.tsx`
- 删除 `notStarted` 分支（不再用专门的"尚未开始"卡片替代表单）。
- 在报名卡顶部新增一条**温和提示**（仅当 `starts_at > now` 时显示）：
  > 活动将于 YYYY-MM-DD HH:mm 开始，现在即可提前报名，优惠券会在活动开始当日生效。
- 表单、按钮、协议等保持完全可用，照常走 `submit()`。

### 3. 不动的地方
- `activities.status === 'active'` 仍是硬条件；`ended` 仍然不能报名。
- 券的生效时间由现有 `voucher_claims_set_expires` 触发器 + `vouchers.starts_at/ends_at` 控制，本次不调。
- 后台「我的活动」详情页不动。

## 验证
1. 选一个 `starts_at` 在未来的活动公开页：能看到顶部"提前报名"提示，且能正常完成报名并跳到券页。
2. 已结束的活动：仍显示"活动已结束"卡片，不能报名。
3. 进行中的活动：行为完全不变。
