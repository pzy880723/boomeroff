# 高亮"明天"那一条排班

## 目标
在 Me 页"我的排班"30 天列表里，把日期 = 明天 的那张卡片做**深色背景 + 浅色文字**的强调样式，类似截图里的票券风格，让用户一眼能锁定明天的班次。其他日期保持现状。

## 改动范围
仅一个文件：`src/components/me/MyScheduleList.tsx`

不涉及：数据查询、其他页面、仪表盘 SchedulePanel。

## 具体调整

1. **判定"明天"**
   - 用现有的 `addDaysISO(todayISO(), 1)` 算出明天日期字符串。
   - 在 `days.map` 内部用 `d === tomorrow` 得到 `isTomorrow` 标志。

2. **卡片样式（仅当 `isTomorrow` 时）**
   - 把 `<Card>` 背景换成深色（`bg-foreground` 或 `bg-zinc-900`），覆盖原来的 `bg-muted/30`。
   - 加一个柔和阴影 + 1px 高亮描边，呼应截图里的票券质感。

3. **内部文字反色**
   - 日期数字、星期：从默认 `text-foreground` / `text-muted-foreground` 换成 `text-background` / `text-background/70`。
   - 班次副标题、"门店当日无排班"、同事行（A 班 / B 班 / 名字）等所有原本是 `text-muted-foreground` 的文字，在 `isTomorrow` 下统一换成 `text-background/70` 或 `/80`。
   - A/B/C 班的彩色字保持彩色不变（深色背景下识别度更好）。
   - "休息" 徽章在深色卡上换成 `bg-background/15 text-background`。

4. **追加一个"明天"角标**
   - 在日期列上方加一个小 pill：`明天`，深底浅字 → 卡片本身已经是深底，所以 pill 用浅色描边 / 浅底深字（参考用户截图的 BOOMER 配色）。
   - 仅 `isTomorrow` 时渲染。

## 不改动
- 今日卡片样式保持当前默认（不抢"明天"的视觉重点）。
- 同事分组、汇总卡、加载态、数据逻辑全部不动。
- 仪表盘的"明日"行不动（用户只点了"我的排班"）。

## 验收
- `/me` → 我的排班，"明天"那张卡片明显比其他卡更深、文字浅，可一眼定位；其他日期视觉无变化。
