## 目标
将「我的排班」卡片中「明天」票券左侧日期标签的背景色，从当前过亮的 `bg-foreground` 改为与上方等级卡片（中古之神）一致的暖咖色调，避免视觉突兀。

## 改动文件
- `src/components/me/SchedulePanel.tsx`

## 具体修改
在 `TicketRow` 组件的 `stubBg` / `stubFg` / `stubAccent` 分支中：
- `isTomorrow` 时的背景类由 `bg-foreground` 改为 `bg-gradient-primary`（与 LevelCard 同色系渐变，适配主题明暗切换）。
- `isTomorrow` 时的文字颜色由 `text-background` / `text-background/70` 改为 `text-primary-foreground` / `text-primary-foreground/70`，确保咖色底上的深色文字依然清晰。
- 标签边缘的虚线分割线颜色同步微调，保持和谐。

## 不涉及
- 其它日期的票券颜色不变。
- 排班逻辑、数据请求、展开/收起交互均不动。