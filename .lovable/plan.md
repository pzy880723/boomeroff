## 目标

按选定的「暗色票根」方案重写仪表盘抽屉里的「排班」Tab：`src/components/dashboard/SchedulePanel.tsx`。

## 数据层

需要每行独立的门店名，当前 `useDashboardData` 已有 `todayShift` / `weekShifts` / `colleaguesToday` / `shopName`，但 `weekShifts` 每项只有 shift 信息没有 `shop_id`。

- 检查 `useDashboardData.ts` 的 `weekShifts` 查询，给每行带上 `shop_id` 和 `shopName`（join `shops` 表或借助已查的 shops map）。如果改 hook 影响面太大，则在 SchedulePanel 内单独补一个轻量 query（user_id + work_date in [today, +1, +2]）并拼上 shops map。优先改 hook，因为「我的」面板已经做了 shopNameMap，复用思路最干净。

## UI 层（参考已选 v3）

整卡：`bg-white/[0.05] border-accent/15 rounded-2xl shadow-lg overflow-hidden`，外层抽屉底色保持现状。

### 顶部 Section — 今日在岗
- 一行小标题 `今日在岗`（左，10px 古铜金）+ 右侧「N 位店员在岗」
- 头像横滚：复用 `colleaguesToday` 数据（已包含 avatar_url、display_name、shift_code），尺寸 32px、`-space-x-2` 重叠、超过 6 个显示 `+N` 灰金气泡
- 底部：dashed 古铜金 0.25 分割线，**不**做物理 notch 缺口（移动端实现成本高且画面密，改为单纯虚线即可）

### 中部 Section — 三日票根行
今日 / 明日 / 后天，每行布局：
```
[44px 日期柱]  [垂直分割线]  [主体：徽章+门店名 / 时间]  [右侧休息图标或 chevron]
```
- 日期柱：上 9px 古铜金小字 `TODAY/TMRW/DAY +2`（不要英文！改成「今日 / 明日 / 后天」竖排标题：第一行小号副字 `周几`，第二行 `今日`），主文用 `text-accent-soft`，非今日 opacity 60
- 今日行：底色 `bg-foreground/[0.03]` 圆角，与其他日区分
- 班次徽章配色（**禁止 shift.color 紫蓝**，强制覆盖）：
  - A → 实底古铜金 `bg-accent text-primary`
  - B → 描边款 `bg-transparent border border-accent text-accent`
  - C → 砖红 `bg-destructive/85 text-destructive-foreground`
  - 其他/未知 → 同 B
  - 休息 → 不显示徽章，主文「今日休息」+ Coffee 图标
- 时间：`HH:MM — HH:MM`，`tabular-nums`，accent-soft 色；非今日 opacity 60
- 门店名：徽章右侧 10px 小标签 `bg-foreground/[0.06] px-1.5 py-0.5 rounded`，超长截断

### 底部 — 古铜金渐变细条
1.5px 高，`bg-gradient-to-r from-transparent via-accent/30 to-transparent`，提示卡片完结，呼应票根撕边

### 卡外底部 — 本周节奏 + 入口
- 左侧 7 个 1.5px 小圆点（按未来 7 天上班/休息着色：上班 `bg-accent`，休息 `bg-foreground/15`），加 `本周节奏` 标签
- 右侧 `查看 30 天排班 →` 按钮，点击关闭抽屉并 `navigate('/me')` 滚到排班区

## 配色 token 规则

- 抽屉是深色环境，沿用 dashboard 现有的 `text-[hsl(var(--primary-foreground)...)]` 写法或更简洁的 `text-accent / text-accent-soft / text-foreground`（dashboard 内部上下文，primary-foreground = 近白）
- 禁止任何硬编码十六进制；禁止 indigo/violet/sky/blue 类
- 班次原始 `shift.color`（可能是紫色）**完全忽略**，只用上面 A/B/C/默认 4 套映射

## 改动文件

- `src/components/dashboard/SchedulePanel.tsx`：整体重写为 3 个 section（在岗头像 / 三日票根 / 周节奏+入口）
- `src/hooks/useDashboardData.ts`：给 `weekShifts` 每项补 `shopName?: string | null`（join `shops` 或复用现有 query 拼接）；若已经有 `shop_id`，仅补 shops map 查询即可

## 不动

- `me/SchedulePanel.tsx`、其他页面、DB schema、`shop_shifts.color` 字段（前端层覆盖即可，不动数据）
