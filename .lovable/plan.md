## 诊断
你看到的"我的排班"实际渲染的是 `src/components/me/SchedulePanel.tsx`(里面的 `TicketRow`),不是我上一轮改的 `MyScheduleList.tsx`。所以那次改动对页面零效果 —— 这就是"看起来没修好"的根本原因,对不起。

`SchedulePanel` 里今天/明天/后天三张票券的左侧色块逻辑:
- index 0 (今天):`bg-accent-soft` —— 浅米
- index 1 (明天):`bg-primary` —— 当前主题下也是浅色,所以视觉上跟今天/后天几乎一样,完全没有"提醒感"
- index 2 (后天):`bg-accent-soft` —— 浅米

## 改动
只动 `src/components/me/SchedulePanel.tsx` 的 `TicketRow`,只针对 `index === 1`(明天)的左侧票根 stub:

1. 背景换成深色:`bg-foreground`(深棕/深色,主题里和文字同色,确保深);
2. 文字前景换成 `text-background`(浅米),小字用 `text-background/70`;
3. 票根上的两个圆形装饰点(模拟撕票孔)保持 `bg-card`,继续和卡片背景一致,看起来像戳孔;
4. 票根虚线分隔边换成 `border-background/30`,保证在深底上可见。

其他一切不动:
- 今天、后天票根:保持 `bg-accent-soft`,完全不变;
- 票券右侧主体(休息徽章、A 班/B 班同事行、门店名):完全不变,跟其他日期一致;
- 顶部标题、未来 30 天统计、展开按钮、BOOMER 装饰:完全不变;
- 上一轮在 `MyScheduleList.tsx` 里的高亮逻辑会回滚到无高亮(那个组件目前没有在页面里展示,但保留干净的代码)。

## 验收
`/me` 页"我的排班"里,只有"明天"那张票券的左侧票根是深色底浅色字,其他视觉完全和现状一致。
