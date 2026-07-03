## 问题
1. **领取按钮显示破损**：截图中"领 +5"按钮文字被截断，只看到深色圆角空块。原因是 `SpiritTaskCard.tsx` 里按钮 `size="sm" + h-7 px-2.5`，`bg-gradient-accent` 与暗色抽屉背景对比不够，加上按钮宽度受父容器约束被压缩，出现文本重叠/截断。
2. **提醒不主动**：现在的 `SpiritTaskCard` 塞在 `SpiritChatPanel` 消息流顶部，聊天多几轮后就被顶到滚动区最上面，用户根本不知道"还有一项可领"，需要打开抽屉再上滑才看到。用户要求：**有可领奖励时，直接以独立浮层弹出，不用上滑，一键领取**。

## 方案

### 一、新增"主动奖励浮层" `SpiritRewardPopover.tsx`
挂在 `FloatingDashboard.tsx`（BOOMER 胶囊按钮同级），作为独立浮层：

- **触发条件**：`useTasks().totalUnclaimedCount > 0` 且当前不在抽屉打开态。
- **展示形态**：从 BOOMER 胶囊上方弹出一张小卡片（宽 ~ 280px），带小獭头像 + "你还有 X 项奖励可领 (+N 经验)" + **一键领取**主按钮 + 折叠展开的项目列表 + 右上角 × 关闭。
- **交互**：
  - 一键领取：调用 `tasks.claimAllPending()` + 遍历 `claimableDaily.claimDaily()`，成功后浮层进入庆祝态 1.2s 后自动收起。
  - 逐条领取：点击项目行的领取按钮直接领取该项。
  - 关闭 (×)：本次会话内 dismiss（sessionStorage 记录），有新的可领项再弹。
  - 点击卡片头部/"去完成"：打开对应路由或抽屉。
- **首次进入应用**：延迟 1.5s 弹出（避免首屏干扰），并带轻微弹跳动画引导视线。
- **移动端安全区**：`bottom: calc(env(safe-area-inset-bottom) + 88px)`，位于 BottomTabBar 与 BOOMER 胶囊之上。

### 二、抽屉内保留 `SpiritTaskCard`（辅助入口）
- 不删除，用户从抽屉进来时仍可看到并领取（保持一致的能力）。
- 但**将其位置从消息流顶部（会被滚动隐藏）提升到抽屉顶部固定条**：放在 `SpiritDrawer.tsx` 顶部品牌栏下方 shrink-0 区，不随聊天滚动。

### 三、修复领取按钮显示
在 `SpiritTaskCard.tsx` 的按钮：
- 加 `min-w-[64px]` 防止被压缩、加 `whitespace-nowrap`。
- 提升按钮文字对比：`text-white font-semibold`，去掉 gradient 与暗色描边冲突，改用实心 `bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]`。
- Row 内 `title` 保留 `truncate`，把按钮 `shrink-0` 位置提前确保始终显示完整文字。

## 涉及文件
- 新建 `src/components/spirit/SpiritRewardPopover.tsx`
- 修改 `src/components/dashboard/FloatingDashboard.tsx`（挂载浮层）
- 修改 `src/components/spirit/SpiritDrawer.tsx`（TaskCard 上移到固定区）
- 修改 `src/components/spirit/SpiritChatPanel.tsx`（去掉消息流顶部的 taskCard 或改为可选）
- 修改 `src/components/spirit/SpiritTaskCard.tsx`（按钮修复 + 支持 `compact` 变体供浮层复用）
