## 背景

目前周排班上限（默认 5 天 / `max_per_week`）只统计当前选中门店的排班数。切换到另一家门店时，该员工的 `cnt/cap`（如 `2/5`）会重置，导致同一员工在多门店相加超过 5 天。

需求：无论员工在哪家门店被排班，本周已排天数都要合并计入，切换门店后剩余天数不变。同时，同一员工同一天也不应被两家店同时排班。

## 改动点

### 1. `src/components/admin/ScheduleManager.tsx`
- 增加一份"本周跨门店"的轻量查询，与现有按门店的 `scheds` 并存：
  - `scheds`（保留）：`eq('shop_id', shopId)`，仅用于当前门店的排班表格渲染、`clearWeek`、删除/换班操作。
  - 新增 `allWeekScheds`：`gte('work_date', weekStart).lte('work_date', end)`，不带 `shop_id` 过滤，只 `select('user_id, work_date, shop_id')`。
- `weekCountOf(userId, excludeDate?)` 改为基于 `allWeekScheds` 统计（排除指定 user 当天的所有记录，避免 add 操作时把自己算两遍）。
- `validateAssign` 中再加一条硬约束：若 `allWeekScheds` 里该 user 在该 date 已有任意门店的排班，提示"该员工当天已在其他门店排班"。
- 增删排班后刷新 `allWeekScheds`（直接复用 `refresh()` 即可，把它放进 Promise.all）。
- 候选员工弹窗、底部员工属性栏的 `cnt/cap` 显示均使用新的跨门店计数。

### 2. `supabase/functions/generate-schedule/index.ts`
- `existing` 查询拆成两份：
  - `existingThisShop`：保留 `eq('shop_id', shopId)`，用于 occupied 集合（仅按门店覆盖删除），和 overwrite 时的 `delete().eq('shop_id', shopId)`。
  - `existingAllShops`：本周全门店，用于：
    - `weekCountByUser`（跨门店计数，传给 AI 的 `existing_count`）；
    - `occupiedUserDate` 集合应包含全门店当日已排，防止 AI 把员工同一天又排到本店。
- overwrite 分支只清空本门店：仅从 `weekCountByUser` 中减去本门店已删除部分，并从 `occupiedUserDate` 中移除本门店的 (date,user) 项；其他门店已排仍保留计数。
- prompt 措辞无需变更（约束 6 仍然成立，"已包含 existing_count 中已有天数"现在天然就是跨门店）。

### 3. 不改动
- 数据库 schema、RLS、`shift_schedules` 表结构均无需变更。
- `staff_profiles.max_per_week` 的含义不变（每周最多上班天数，仍硬上限 5）。
- 排班表格本身仍按门店渲染（管理员只看自己当前选择的门店）。
- `clearWeek`、`removeAssign` 仍只影响本门店数据。

## 验收

1. 给员工 A 在门店甲本周排 2 天，切到门店乙，A 的徽章应显示 `2/5`，候选弹窗中 A 也显示 `2/5`，最多再排 3 天。
2. 在门店乙将 A 排到第 4 天（含跨店共 6 天）应被硬拦截，提示已达上限 5 天。
3. 同一天 A 已在甲店上班，在乙店选 A 时给出"该员工当天已在其他门店排班"的硬错误。
4. AI 智能排班：在甲店已排 2 天的前提下，对乙店本周生成方案时，A 的总排班 ≤ 5 天，且不会被排到 A 当天在甲店已有班次的日期。
