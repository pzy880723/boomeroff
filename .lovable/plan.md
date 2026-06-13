## 问题

你截图里的"明天"卡片在 `/me` 页，但 `/me` 实际渲染的是 `src/components/me/SchedulePanel.tsx`（票根式 TicketRow 卡片），不是上次我改的 `MyScheduleList.tsx`（那个只在 `/my-schedule` 页用）。所以视觉上你看不到任何变化——改对了组件，但是没改你正在看的那个。

## 要改的文件

只改 `src/components/me/SchedulePanel.tsx` 里的 `TicketRow`，针对 `index === 1`（明天）那一行做"深底浅字"的着重处理。其他天（今天、后天、展开后的 27 天）保持现状。

## 具体改动

明天那一行（`index === 1`）：

1. **整张票卡背景变深**：外层容器从 `bg-background border-border` 改成 `bg-foreground border-foreground shadow-lg ring-1 ring-foreground/10`。
2. **左侧票根**：保持现在的 `bg-primary` 不变（已经是深色），但右侧虚线分隔色改为 `border-background/30`，两端的小圆点底色改为 `bg-foreground` 以贴合深底。
3. **右侧正文区文字反色**：
   - 班次时间（`formatShiftTime`）从 `text-primary` → `text-background`
   - 门店名 `shopName` 从 `text-primary` → `text-background/85`
   - 同事分组行：`text-muted-foreground` → `text-background/70`，A/B/C 班标签色保留不变（仍用强调色，在深底上依然能看清），"· 名字"部分从 `text-primary/80` → `text-background/85`
   - 同事区上方的虚线分隔线 `border-border/60` → `border-background/25`
   - "休息" 徽章（理论上明天不会同时既休又显示，但保险起见）：`bg-secondary` → `bg-background/15`，文字 → `text-background`

## 不变的部分

- 今天（index 0）和后天（index 2）的票卡完全不动
- 展开后的 27 天列表不动
- `MyScheduleList.tsx`（`/my-schedule` 页）保留上次已做的"明天"深色样式
- Dashboard 上的"明日"行不动

## 验证

改完后在 `/me` 滚到"我的排班"卡，第二张票（明天）应该是黑底+浅字，与今天/后天形成明显对比。
