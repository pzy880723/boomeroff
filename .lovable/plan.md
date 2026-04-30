## 顶部栏高度恢复 + logo 放大溢出

恢复顶部栏 `h-12`（48px），但保留 logo 80x80。让 logo 通过 `overflow-visible` 向下溢出，不撑高顶部栏。

### `src/components/layout/PageHeader.tsx`

1. 第 45 行 `<header>`：加 `overflow-visible`（确保子元素可溢出）
2. 第 46 行：`h-20` → `h-12`，并加 `overflow-visible`
3. 第 58-71 行 logo 按钮：
   - 容器加 `relative`，`button` 改为 `relative -my-4 flex items-center`（向上向下负边距让大 logo 居中溢出）
   - logo 保持 `h-20 w-20`

最终效果：顶部栏视觉高度仍为 48px，但 logo 80px 居中溢出（向下挂出约 16px），不影响布局。