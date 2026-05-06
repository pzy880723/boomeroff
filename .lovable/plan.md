## 问题
今日任务模式下点"退出/结束测试"会跳到下一题。

原因：`QuizDialog` 的退出按钮同时调用了 `onExit?.()` 和 `onOpenChange(false)`。`onOpenChange` 绑定到 `MyLibrary` 的 `handleQuizClose`，它会读 `taskMode` 判断要不要推下一题。`onExit` 里的 `setTaskMode(false)` 是异步的，`handleQuizClose` 拿到的还是旧值 `true`，所以触发了"切下一题"。

## 修复
两个文件，纯前端逻辑：

### 1. `src/components/library/QuizDialog.tsx`
- 退出按钮**只调用 `onExit?.()`**，**不再调** `onOpenChange(false)`。
- 关闭由父组件通过把 `quizItem` 置 null 来完成（`open={!!quizItem}` 自动变 false）。
- 兜底：若未传 `onExit`，才回退到 `onOpenChange(false)`。

涉及两处按钮：进行中页面 + 结果页"结束测试"。

### 2. `src/pages/MyLibrary.tsx`
`onExit` 已经在做 `setTaskMode(false); setTaskQueue([]); setTaskIdx(0); setQuizItem(null);` —— 保持不变，作为唯一的退出入口。

## 不做的事
- 不动 `handleQuizClose` 自动推下一题的正常流程（答完一份后仍走它）。
- 不动 UI 文案、布局、上一题按钮。
