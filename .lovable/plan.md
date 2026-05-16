## 问题定位

数据库里今天 B 班实际有两人：`lebaibai` 和 `鹿哥`。但仪表盘"今日班次"只显示"今日独自当班"，没列出同事。

排查 `src/hooks/useDashboardData.ts` 后发现两个连带 bug：

1. **`鹿哥` 没有 `staff_profiles` 记录**（数据库已确认）。当前代码先查 `staff_profiles.shop_id`，若为空就只用 `user_id.eq.<self>` 过滤 `shift_schedules`，于是根本拉不到同事的排班行 → 自然认不出同班同事。
2. 即使 `staff_profiles` 有 `shop_id`，代码仍只用一次 `.or(...)` 拼接过滤，逻辑脆弱。`shift_schedules` 表本身就带 `shop_id` 列，更稳妥的做法是直接基于"今日自己那一行的 shop_id"反查同店同班。

## 修复方案（只改 `src/hooks/useDashboardData.ts`）

把同事查询逻辑改成"先定位 shop_id，再二次查询同店同班"，与 `staff_profiles` 是否存在解耦：

1. 第一次并发查询里，**移除 `staff_profiles` 依赖**，先用 `user_id.eq.<self>` 拉自己未来 30 天的排班（其它字段照旧）。
2. 得到 `todayRow` 后：
   - 优先取 `todayRow.shop_id`（排班行本身有这个字段）。
   - 没有则 fallback 到 `staff_profiles.shop_id`（保留作为兜底，单独一次小查询，且只在 todayRow 缺 shop_id 时才发）。
3. 若拿到有效 `shopId` 且存在 `todayRow`，**再发一次**精准查询：
   ```
   shift_schedules
     .select('user_id, shift_code')
     .eq('work_date', today)
     .eq('shop_id', shopId)
     .eq('shift_code', todayRow.shift_code)
     .neq('user_id', self)
   ```
   用结果的 `user_id` 列表去 `profiles` 拉 `display_name / avatar_url`，组装 `colleaguesToday`。
4. `weekShifts` / `nextShift` 逻辑保持不变，仍基于自己的排班行计算。

## 顺带的小清理

- 删掉原先 `.or(shopId ? ... : ...)` 那段不再需要的拼接。
- `colleaguesToday` 兜底为空数组，文案保持现有的"X 位同事在岗 / 今日独自当班"。

## 不改动

- `SchedulePanel.tsx`、`MainLayout`、其他 dashboard 面板。
- 数据库结构、RLS、edge functions 都不动。
- 历史 `staff_profiles` 缺失的账号（如 `鹿哥`）不在本次补录范围；本修复让仪表盘对这类账号也能正常显示同事。

## 验证

实施后用 `lebaibai` 或 `鹿哥` 登录 `/me`，仪表盘应：
- "今日班次"显示 B 班；
- 副标题显示"1 位同事在岗"；
- 同班同事卡片出现对方头像和昵称。
