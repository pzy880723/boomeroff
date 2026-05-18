## 目标

把「我的」页面的排班模块换成 **Vintage 票根** 样式，配色严格用项目暖棕+古铜金，去掉之前所有蓝紫色。

## 设计要点（参考已选 v3 原型）

- 整卡：`bg-card / border-border`，圆角 + 项目自带 `shadow-md`
- 顶部 Header：左侧古铜金圆形日历图标 + 标题「我的排班」+ 副标「未来 30 天上班 N 天」；右侧小字 `Official Schedule / Vintage Archive`（古铜金 + muted-foreground，Oswald 字体）
- 默认只显示 3 行：今日 / 明日 / 后天，每行做成「票根」造型：
  - 左侧 80px 票根 stub：日期 + 周几 + 顶部标签
    - 休息行 → `bg-secondary`（米灰）+ 深棕字
    - 今日上班行 → `bg-accent-soft`（浅金）+ 深棕字
    - 明日/后续 → 当 stub 是「最近的上班日」时用 `bg-primary`（深 espresso）+ 金字突出
    - stub 右上 / 右下加一对小圆缺口（`bg-background` 圆点），分割线用 dashed border
  - 右侧主体：班次徽章 + 时间段 + 右侧「Location / 门店名」
    - 徽章配色固定：A=`bg-accent text-accent-foreground`；B=`bg-primary text-accent border-accent/40`；C=`bg-destructive/85 text-destructive-foreground`；休息=`bg-secondary text-secondary-foreground` 显示「休息」
    - 时间格式：`HH:MM - HH:MM`，`tabular-nums`
    - 门店名取每行 `shift_schedules.shop_id` 对应的 `shops.name`，**每行独立**，不再统一显示一个门店
- 底部按钮：`展开后续 27 天排班 ▼`，点击切换到完整 30 天列表（同样的票根行，去掉 stub 顶部标签 / 改为「周X」即可），再点收起。

## 改动范围

仅 `src/components/me/SchedulePanel.tsx` 一个文件，保持现有数据 hooks 不动：

1. 数据层：把当前已查的 30 天 `shift_schedules`（带 `shop_id`）按日期聚合，每个日期保留 `{ shiftCode, startTime, endTime, shopName }`；不再用「当前默认门店」覆盖每行。
2. 渲染层：删除现在的 Today/Tomorrow 大卡 + 紧凑列表的双结构，替换为 Header + 3 行票根 + 展开按钮 + 折叠列表。
3. 同班同事块单独折叠到展开区域底部（保留现有逻辑），不再塞进首屏，避免占高。
4. 字体：Oswald 通过现有 `<link>`（首页已加）或 `style={{ fontFamily }}` 内联，无需新增依赖。
5. 全部颜色走 Tailwind 语义 token（`bg-card / bg-secondary / bg-accent / bg-accent-soft / bg-primary / text-primary / text-accent / text-muted-foreground / border-border`），**禁止任何硬编码 hex 和任何蓝/紫 class**。

## 不动的部分

- `useDashboardData.ts`、`dashboard/SchedulePanel.tsx`、数据库 schema、其他页面均不改。
- 「同班同事」列表保留，仅位置下移到展开区。
