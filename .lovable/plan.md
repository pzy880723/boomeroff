## 背景

仪表盘迁到首页后，原来"识别完弹出海獭角标 → 点开领经验"的入口没了。目前 `FloatingDashboard` 只在气泡上显示数字角标，点开抽屉只有对话，不告诉用户"你有 X 项奖励可领"，也没法在对话里领。

`useTasks` 已经聚合了两类可领内容：
- **每日任务** `dailyTasks`：完成 1/3 次识别、通过一次知识测试、发一条 BOOMER 圈帖子
- **事件奖励** `pending`（`exp_pending` 表）：签到连击、点赞、评论、纠错采纳等触发的一次性奖励

`TasksPanel` 已实现完整领取交互，但只在旧仪表盘用到。

## 目标

1. 打开 BOOMER 抽屉时，如果有可领奖励，**在对话流顶部**由 BOOMER 主动"发一条消息"，列出待领内容并允许直接在气泡里点按钮领取。
2. 把所有需要"去做才能拿角标"的每日任务也统一收进这条卡片，未完成的显示"去完成"跳转，完成未领的显示"领取 +N"。
3. 领取后卡片实时更新；全部领完后 BOOMER 说一句庆祝话，卡片自动隐藏。

## 实现方案

### 1. 新增 `SpiritTaskCard.tsx`（`src/components/spirit/`）

BOOMER 气泡内嵌卡片，复用 `useTasks` 的数据和方法：
- 顶部：`🦦 BOOMER：你今天还有 X 项奖励可以领（共 +Y 经验）`
- 已完成未领：绿色行 + `领取 +N` 按钮 → `claimDaily` / `claimEvent`
- 未完成：灰色行 + `去完成` 按钮 → `onNavigate(path)` 关闭抽屉并跳转
- 底部：`一键领取全部（+Y）` 按钮 → `claimAllPending` + 循环 `claimDaily`
- 全部领完时替换为一句 BOOMER 语："今天的角标都被你收干净了，好厉害～"

任务路由映射沿用 `TasksPanel` 的 `TASK_ROUTE`。

### 2. 改 `SpiritChatPanel.tsx`

- 接收新 prop `taskCard?: ReactNode`，在消息流最上方（空态与非空态都显示）渲染。
- 空态 `EmptyState` 上方也保留卡片，让用户一打开就看到。

### 3. 改 `SpiritDrawer.tsx` / `FloatingDashboard.tsx`

- `FloatingDashboard` 里已有 `useTasks()`，把 `tasks` 传给 `SpiritDrawer`。
- `SpiritDrawer` 组装 `<SpiritTaskCard tasks={tasks} onNavigate={(p) => { onClose(); navigate(p); }} />` 传入 `SpiritChatPanel`。
- 首次打开抽屉且 `totalUnclaimedCount > 0` 时，让 BOOMER mascot 状态短暂切到 `alert`（视觉呼应）。

### 4. 领取后交互

- 领取成功后依赖 `useTasks` 的 realtime + `refresh` 自动更新数字；`FloatingDashboard` 气泡角标同步减少。
- 全部领完时保留卡片 2 秒显示"收干净了"，然后 `setDismissed(true)` 折叠。

### 5. 不做的事

- 不改 `exp_pending` 表结构；不改识别页/签到页的触发逻辑。
- 不恢复旧的"识别完弹角标"浮层——BOOMER 抽屉替代它。
- 不动 `TasksPanel`（旧组件仍可用，暂不删）。

## 技术细节

- 领取按钮 loading 用局部 `busyKey` state（复刻 `TasksPanel`）。
- `onNavigate` 走 `useNavigate()`，在 `SpiritDrawer` 里注入。
- 卡片外观：`bg-white/8 border border-white/10 rounded-2xl`，与抽屉深色底一致；行内按钮用 `bg-gradient-accent`。
- 空态时卡片放在 `EmptyState` 前；有历史消息时放在滚动区顶部（跟着滚）。
