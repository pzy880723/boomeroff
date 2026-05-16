## 目标
去掉 `SpiritChatPanel` 顶部"小精灵头像 + 中古小精灵 + 随便问我点啥都行～"那一栏（红框区域），让消息流直接顶到对话/仪表盘 Tab 下方。

## 改动
文件：`src/components/spirit/SpiritChatPanel.tsx`（lines 92-111）

- 删除整个 `{/* 顶部小精灵气泡区 */}` 容器。
- 保留"清空对话"功能：把 `Trash2` 按钮移到消息流容器内右上角（仅当 `messages.length > 0` 时显示），用 `absolute` 定位贴在 scroller 顶部右侧；不再占顶栏高度。

## 不在范围
- EmptyState（消息为空时居中的"你好呀～我是中古小精灵"区域）保留，因为它仅在没有消息时显示，不算红框冗余。
- 抽屉外层 Tab 栏不动。