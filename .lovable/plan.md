## 目标
让小精灵输入框上方的 4 个快捷提问，每次抽屉打开时从一个更大的池子里随机挑 4 条显示，不再每次都是同一组。

## 改动范围
只动一个文件：`src/components/spirit/SpiritChatPanel.tsx`。不动 hook、edge function、数据库。

## 做法

### 1. 扩充 `QUICK_CHIPS` 文案池（约 16–20 条）
分几个口吻方向，全部贴合中古门店店员日常：

- 排班 / 同事：
  - 今日和谁一起上班？
  - 明天我上班吗？
  - 这周谁休息？
- 打卡 / 等级：
  - 我的等级和打卡
  - 离下一级还差多少？
  - 这个月我打卡几天了？
- 情绪 / 打气：
  - 帮我打打气
  - 来句鼓励的话
  - 今天有点丧，安慰一下我
- 中古冷知识：
  - 今天学点啥
  - 来个中古冷知识
  - 讲个奢侈品小八卦
- 工作小帮手：
  - 顾客嫌贵怎么回？
  - 这件怎么搭着卖？
  - 帮我想个朋友圈文案

每条对应一个更完整的 `prompt`（沿用现有结构 `{ label, prompt }`）。

### 2. 抽屉每次打开抽 4 条
- 把当前展示的 4 条放进组件状态 `displayChips`。
- 用 `useMemo` 或 `useState + useEffect` 在 **挂载时** 用 Fisher-Yates 洗牌 `QUICK_CHIPS`，取前 4 条赋给 `displayChips`。
- 因为抽屉关闭时面板会卸载（或者父组件用 key 切换），下次打开就会重新挑；如果发现面板其实不卸载，则改成监听 `messages.length === 0` 从 0 变化的时机重新抽。
- 渲染处把 `QUICK_CHIPS.map(...)` 换成 `displayChips.map(...)`。

### 3. 保留现有行为
- 点击后行为不变（往输入框塞 prompt 并发送）。
- 仅当 `messages.length === 0` 时才显示这一排（现有逻辑），不变。
- 不引入新依赖。

## 不动的地方
- ThinkingHint / 上传 / 流式 / 错误态 全部保持不变
- SpiritChatPanel 的 props、useSpiritChat 都不动
