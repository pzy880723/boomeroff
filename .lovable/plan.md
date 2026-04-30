## 缩减顶部栏与底部栏高度

### `src/components/layout/PageHeader.tsx`
- header 高度：`h-20` → `h-10`（40px）
- logo 尺寸：`h-16 w-16` → `h-8 w-8`

### `src/components/layout/BottomTabBar.tsx`
- 容器高度：`h-16` → `h-12`（48px）
- 普通 tab：图标 `w-5 h-5` → `w-4 h-4`，文字 `text-[11px]` → `text-[10px] leading-none`，间距 `gap-1` → `gap-0.5`
- 中间 AI 识物按钮：圆形 `w-9 h-9` → `w-7 h-7`，图标 `w-5 h-5` → `w-4 h-4`，shadow `shadow-md` → `shadow-sm`

### `src/components/layout/MainLayout.tsx`
不需改：底部 `pb-20` 仍能容纳更小的底部栏，留出富余空间（可选保留）。