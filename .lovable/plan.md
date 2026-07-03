## 目标
移除 BOOMER 抽屉顶部（图中红框）常驻的"你今天还有 N 项奖励可以领"任务卡。奖励入口现在已经有两处更合适的呈现：

1. **首页** `RewardInboxCard` —— 默认收起，展开看任务清单，是常态入口。
2. **BOOMER 对话内消息气泡** —— 完成任务后 BOOMER 主动发消息 + 内联"领取 +N"按钮，是主动推送场景。

抽屉顶部再挂一张一样的卡片是重复展示，还会挤占对话区。

## 改动
- `src/components/spirit/SpiritDrawer.tsx`
  - 删除顶部 `<SpiritTaskCard />` 区块及其 `tasks` 相关传递。
  - `tasks` prop 仍需保留（用于 useEffect 里判断"打开抽屉时是否需要 BOOMER 主动播报奖励"）以及传给 `SpiritChatPanel` 让消息气泡里的"领取"按钮能真正调用 `claimEvent / claimDaily`。
  - 关闭按钮 (`X`) 的绝对定位保留不变。
- 不改 `SpiritTaskCard.tsx` 本体（首页 `RewardInboxCard` 视觉独立，未依赖它；组件文件可保留待后续复用/清理，本次不动以缩小影响面）。
- 不改首页、不改 `SpiritChatPanel` 内联领取逻辑。

## 验收
- 打开 BOOMER 抽屉：顶部只有标题栏和关闭按钮，对话区直接从欢迎语开始，不再出现"你今天还有 N 项奖励"卡片。
- 首页奖励卡片、对话内 BOOMER 主动播报 + 内联领取按钮功能不受影响。
