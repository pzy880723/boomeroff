## 问题

`SpiritChatPanel` 自己调 `useSpiritChat()`，状态（`messages` / `conversationId` / `status`）挂在面板组件上。
而 `FloatingDashboard` 在抽屉关闭动画结束后 `setMounted(false)`，整个 `SpiritDrawer → SpiritChatPanel` 卸载，hook 状态随之销毁。下次打开是全新的 hook 实例 → 聊天记录就空了。

后端 `spirit_conversations / spirit_messages` 一直存着，所以记录其实没丢，只是前端没去取。

## 修复思路

把 `useSpiritChat()` 上提到 **FloatingDashboard**（这个组件常驻不卸载），通过 props 传给 `SpiritDrawer`，再传给 `SpiritChatPanel`。这样：

- 抽屉开/关不再影响 hook 实例
- `messages` / `conversationId` 自然保留
- 不需要重新请求后端，体验是"原样恢复"
- 即使刷新页面，也可以后续再加一层"启动时拉取最近一条会话"的兜底（本次先不做，避免扩大范围）

## 具体改动

### 1. `src/hooks/useSpiritChat.ts`
- 重新导出 `loadConversation` / `newConversation` / `clear` 等能力（之前精简掉了），保持现在的 `messages / status / send / stop / conversationId` 即可，无需 UI 入口

### 2. `src/components/dashboard/FloatingDashboard.tsx`
- 在组件顶部调用 `const spiritChat = useSpiritChat()`
- 把 `spiritChat` 整个对象作为 prop 传给 `<SpiritDrawer ... chat={spiritChat} />`

### 3. `src/components/spirit/SpiritDrawer.tsx`
- 新增 `chat: ReturnType<typeof useSpiritChat>` prop
- 把 `<SpiritChatPanel />` 改成 `<SpiritChatPanel chat={chat} />`

### 4. `src/components/spirit/SpiritChatPanel.tsx`
- 改为接收可选 `chat` prop；如果传了就用 prop，否则 fallback 到 `useSpiritChat()`（保持组件可独立使用）
- 其余逻辑不动

## 不动的地方

- `spirit-chat` / `spirit-conversations` edge function、数据库表、RLS：全不动
- 输入框、快捷 chips、拍照/相册、发送/停止按钮、空状态、消息气泡：全不动
- 小精灵浮窗外观、拖拽、抽屉动画：全不动

## 副作用 / 注意

- `useSpiritChat` 现在会在用户一登录就跑（FloatingDashboard 渲染时即挂载），但它本身只是几个 `useState` + `useRef`，不发请求，开销可忽略
- `pending` 本地选图状态仍然留在 `SpiritChatPanel` 里 —— 抽屉关掉时还没发出去的图会被丢弃，这与用户当前预期一致（"记录保留"指的是已发送的对话）
