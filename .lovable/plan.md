## 问题

打开小精灵抽屉时，`SpiritChatPanel.tsx` 第 36-38 行的 `useEffect` 调用 `inputRef.current?.focus()`，在手机端会立刻弹出输入法，遮住整个小精灵面板。

```ts
useEffect(() => {
  inputRef.current?.focus();
}, [status]);
```

依赖是 `status`，初次挂载时就触发一次 focus → 键盘弹出。

## 改动

删除这个自动聚焦的 `useEffect`。输入框只在用户主动点击时才聚焦（浏览器原生行为）。

发完消息后也不再自动 refocus —— 这样用户能完整看到小精灵的回复，想继续聊再点输入框即可，符合用户的诉求。

## 涉及文件

- `src/components/spirit/SpiritChatPanel.tsx`（删 3 行）
