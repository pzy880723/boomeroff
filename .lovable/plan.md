## 目标
将首页「我的排班」卡片改为同时展示**今日排班**和**明日排班**两行，其中**明日**视觉上更突出（更大字号 / 高亮底色 / 主色文字），今日作为次要信息呈现在上方。

## 修改范围
仅改动 `src/pages/Home.tsx` 的排班数据获取与「我的排班」SectionCard 渲染，其它模块不动。

## 数据层
- 用 `todayShanghai()` + 明日 ISO 计算两天日期。
- 将原来「查最近一条」改为查这两天：
  ```
  supabase.from('shift_schedules')
    .select('work_date, shift_code')
    .eq('user_id', user.id)
    .in('work_date', [today, tomorrow])
  ```
- state 从 `nextShift` 拆成 `todayShift` / `tomorrowShift`（都可能为 null=当天休息）。
- 顺带 join `shop_shifts`（code → start/end/color/name）以在卡片里展示班次时间，与 `ShiftBadgeRight.tsx` 里的做法保持一致。

## 视觉
SectionCard 内改为两行结构：
- **今日** 行：小字号 `text-xs` 灰字标签「今日 · MM/DD 周X」+ 右侧小 Badge 显示班次代码或「休息」。
- **明日** 行：大卡片，`bg-primary/8` + `border-primary/40`，左侧「明日 · MM/DD 周X」 `text-sm font-bold` + 班次时间 `text-base font-semibold tabular-nums`；右侧大 Badge（`text-base px-3 py-1`，班次颜色底），无排班则展示「休息」灰底。
- 两天都无排班时保留原「近期暂无排班 → 去查看」兜底。
- 复用 `formatShiftTime` / `shortDateLabel` / `weekdayLabel`（`src/lib/scheduleUtils.ts`）。

## 不动的部分
- 排班数据流其余用途（如 `SchedulePanel`、`ShiftBadgeRight`）不变。
- 卡片标题「我的排班」和右上「全部 →/me」入口保留。
