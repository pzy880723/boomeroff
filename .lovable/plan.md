## 现状 / 问题
- 今日任务 5 个，做完第 1 个就停在结果页，用户点"结束测试"→ 直接清空整个队列退出。
- 任务推进逻辑写在 `handleQuizClose`（关闭即推进），但"结束测试"也走关闭，且现在调 `onExit` 清队列，所以无法推进，体验=只测一个。
- 重开任务时 `startTodayTask` 总是从 `todayList[0]` 开始，已测过但未通过的商品仍排在最前，等于重头来。

## 目标
1. 在今日任务中，做完一个 → 结果页出现"下一个商品"按钮，点了直接进下一个；最后一个出现"完成今日任务"。
2. 中途"退出"=真退出，不丢失进度；下次进入今日任务，从未测试过的商品开始。
3. 通过的商品不再出现（现有逻辑已满足）；当天测过但没通过的，本次任务流程内也不再回头，今天剩下的"未测过"先做完。

## 改动

### 1. `src/components/library/QuizDialog.tsx`
- 新增 props：`hasNext?: boolean`、`onNext?: () => void`。
- 结果页按钮区在 `hasNext && onNext` 时：
  - 主按钮 = "下一个商品 →"（调 `onNext`）
  - 次按钮 = "再考一次"（reset，仅当未通过时显示）
  - 末按钮 = "结束今日任务"（调 `onExit`）
- 普通模式按现有布局（结束/再考一次/换一套题）。
- 进行中页"退出"按钮不变。

### 2. `src/pages/MyLibrary.tsx`
- 删掉 `handleQuizClose` 里"自动推进下一题"的逻辑。`onOpenChange(false)` 现在只在用户从弹窗外关闭/按 ESC 时触发，统一视为"退出"——和 `onExit` 行为一致：清空 taskMode/queue/idx/quizItem。
- 给 `<QuizDialog>` 传：
  - `hasNext={taskMode && taskIdx + 1 < taskQueue.length}`
  - `onNext={() => { const i = taskIdx + 1; setTaskIdx(i); setQuizItem(null); setTimeout(() => setQuizItem(taskQueue[i]), 60); }}`
- 进度持久化（localStorage）：
  - key：`today-task-progress`，值：`{ date: 'YYYY-MM-DD', attemptedKeys: string[] }`。`date` 用本地日。
  - `handleAttempt`/`handlePassed` 时，把当前 item.key 写入 `attemptedKeys`（去重）。
  - `startTodayTask`：读取记录；若 date 是今天，从 `todayList` 中过滤掉 `attemptedKeys`；剩余即为新队列；若全做完，提示"今天已练完"。
  - 通过 `useEffect` 跨日检测：date 不是今天 → 清空。

### 3. UI 文案微调
- 顶部"今日测试任务"按钮显示残余：`今日推荐 X 条`（X = 剩下未测的）。利用上面 attemptedKeys 计算 `remainingToday = todayList.filter(x => !attempted.includes(x.key)).length`。

## 不做的事
- 不动出题接口 / RLS / 数据表。
- 不引入新弹窗或新按钮位置；只改结果页按钮组合。
- 不持久化 score / 不做 server-side 进度（已有 `knowledge_test_results` 记录通过状态，足够）。
