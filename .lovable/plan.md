# 奖励领取交互重构

## 目标
1. **首页新增"奖励待领取"卡片**（收起态 = 上传图的样式）。
2. **移除** BOOMER 胶囊上方的浮层弹窗 `SpiritRewardPopover`。
3. **任务一完成 → Boomer 主动在对话流里发一条消息**，用户在气泡内直接点按钮领取。
4. 胶囊头像继续显示数字红点角标（保持现状）。

## 变更点

### 1) 新组件 `src/components/home/RewardInboxCard.tsx`
- 使用 `useTasks()`，放在首页"正在进行的活动"下方（`Home.tsx` 中插入）。
- 收起态（默认）：一行，Boomer 头像 + 文案：
  - 有可领：`你有 N 项奖励待领取`（accent 高亮 N）
  - 无可领：`你今天还有 N 项奖励可以领`（N = 未完成日常任务数）
  - 副文案：`点右边直接收，或先去完成剩下的`
  - 右侧箭头 chevron，点击整卡展开。
- 展开态：
  - 顶部"一键领取 +X 经验"主按钮（仅在有可领时显示）。
  - 逐项列出：待领奖励 + 已完成日常 + 未完成日常（未完成显示"去完成"跳对应路由）。
  - 复用现有 `RewardRow` 视觉（从 `SpiritRewardPopover` 中抽出到 `src/components/rewards/RewardRow.tsx` 共享）。

### 2) 首页 `src/pages/Home.tsx`
- 排班卡：若今日 + 明日皆无排班 → 整张卡片隐藏（当前是常驻）。
- 在"正在进行的活动"区块之后插入 `<RewardInboxCard />`。

### 3) 删除浮层 `SpiritRewardPopover`
- 从 `FloatingDashboard.tsx` 中移除 `<SpiritRewardPopover>` 引用及 `useNavigate` 相关逻辑。
- 删除文件 `src/components/spirit/SpiritRewardPopover.tsx`。
- 胶囊数字红点角标逻辑保留不变。

### 4) Boomer 主动对话消息
在 `src/hooks/useSpiritChat.ts` 中：
- 新增内部 `injectSystemMessage(role='assistant', content, meta?)`，向 `messages` state 追加一条本地（非持久化）气泡。
- 监听 `useTasks()` 的 `pending` / `dailyTasks.completed` 变化：
  - 维护 `announcedIds` Set（`sessionStorage` 存储，key = `spirit_announced_rewards`），只对**新出现**且未播报过的可领项发送一条 assistant 消息。
  - 合并策略：500ms 防抖，把同一批次的新完成项合成一条消息：
    - 单项："🎉 你刚完成了「XXX」，+N 经验已经准备好了，点下面直接收吧"
    - 多项："🎉 你连着完成了 M 项任务，共 +N 经验待领"
  - 消息附带 `meta.reward = { items: [{kind, id, title, amount}] }`。
- 抽屉打开时（原本就 auto-load history），若有 `announcedIds` 之外的新可领项，也走同一注入流程 → 满足"抽屉打开时自动展示"。

### 5) 对话气泡渲染奖励按钮 `src/components/spirit/SpiritChatPanel.tsx`
- 检测 `msg.meta?.reward`，在气泡下方渲染紧凑按钮组：
  - `一键领取 +X` 主按钮 → 调 `tasks.claimEvent` / `tasks.claimDaily`。
  - 领取成功后：把该消息 meta 标记为 `claimed: true`，按钮变灰显示 "已入袋 +X ✓"，并 toast。
  - 失败：按钮显示"重试"。
- 该气泡不进入服务端 spirit_messages 历史（纯 client 系统消息）。

### 6) `SpiritTaskCard`（抽屉固定顶部那张）保留
- 继续显示今日任务概览与领取，不变。图1样式的首页卡是它的"精简版入口"。

## 技术要点
- 播报去重使用 `sessionStorage[spirit_announced_rewards]`，格式 `Set<'p:{id}'|'d:{key}'>`，避免刷新后重复弹。
- `useSpiritChat` 需要暴露/内部处理 tasks 订阅；为避免循环依赖，在 `SpiritDrawer` 层（已经能同时拿到 `chat` 和 `tasks`）触发注入更简单——把注入逻辑放 `SpiritDrawer.tsx` 里，通过 `chat.appendLocal(...)` API。若 `useSpiritChat` 无此 API 则新增。
- `RewardInboxCard` 展开动画用 `data-state` + Tailwind `transition-[max-height]`，无需 Radix Collapsible。

## 不改动
- `useTasks` 数据层逻辑、领取 RPC、经验计算。
- 胶囊拖拽、红点角标、抽屉本身结构。
- 现有 `SpiritTaskCard` 卡片。
