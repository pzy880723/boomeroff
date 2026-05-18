## 改动

把对话面板右上角的三个浮动按钮（历史 / 新对话 / 清空）整组删掉——它们浮在消息流上挡气泡，且你不需要会话管理 UI。

上下文记忆能力完全保留：`useSpiritChat` 仍然维护 `conversationId`，后端 `spirit-chat` + `spirit_messages` 表照常存储，AI 跨轮记得上文。只是用户看不到「历史会话抽屉」「新建会话」「清空」这些入口。

## 具体代码改动

仅改 `src/components/spirit/SpiritChatPanel.tsx`：

1. 删除第 97–130 行：右上角三个按钮的 `<div className="absolute top-2 right-2 ...">` 整块
2. 删除第 270–338 行：历史会话抽屉的整段 JSX
3. 删除相关状态：`historyOpen` / `historyItems` / `historyLoading`（第 26–28 行）
4. 精简 hook 解构：`useSpiritChat()` 不再需要 `clear / conversationId / loadConversation / newConversation`，只保留 `messages / status / send / stop`
5. 清理顶部 import：去掉 `History`、`Plus`，去掉 `listSpiritConversations / deleteSpiritConversation / SpiritConversationSummary` 的引用

## 不动的地方

- `useSpiritChat` hook 本身、`spirit-chat` / `spirit-conversations` edge function、数据库表结构全部保留 → 后续如果想再加入口很方便
- 输入框、快捷 chips、拍照/相册、发送/停止按钮、空状态、消息气泡，一律不动
- 抽屉顶部 Tabs、关闭按钮也不动
