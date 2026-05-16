## 问题
当前 `SpiritChatPanel.tsx` 的 `EmptyState` 用 `scale(1.35)` 强行放大，导致小精灵头顶超出 260×260 的方框被裁掉。

## 改动（仅 `src/components/spirit/SpiritChatPanel.tsx` 的 `EmptyState`）

1. `transform: scale(1.35) translateY(-4%)` → `scale(1.15) translateY(-2%)`
   - 1.15 是 PNG 透明边距能承受的安全上限，既比原来视觉更大，又不会顶到框外被切。
2. 其他保持不变（容器 260×260、`overflow-visible`、文案、间距）。

## 不动
- `SpiritMascot` 组件本身
- 浮窗胶囊、聊天小头像
- 问候弹窗 `SpiritGreetingDialog`
