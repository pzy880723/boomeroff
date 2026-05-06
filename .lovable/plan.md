# 图片长按拖动排序

把 `KnowledgeRichEditDialog` 里图片九宫格的「前移/后移」箭头按钮，改为**长按 ~250ms 后可拖动**重新排序，移动端友好。

## 实现方案

- 使用 `@dnd-kit/core` + `@dnd-kit/sortable`（项目已用过则复用，没有则安装；轻量、对触摸支持好）。
- 触摸传感器配置：`TouchSensor` 设置 `activationConstraint: { delay: 250, tolerance: 8 }`，实现「长按才触发拖动」，避免误触；`PointerSensor` 设置 `distance: 6` 给桌面端。
- 拖动中：被拖卡片半透明 + 略微放大，其它卡片自动让位（dnd-kit 默认动画）。
- 拖到首位自动成为主图（无需额外操作），保留右下角 ⭐ 按钮作为快捷设置。
- 删除按钮 `pointer-events` 在拖动时禁用，防止冲突。

## UI 调整

- 移除每张图底部的 ←/→ 箭头按钮。
- 卡片左下角加一个小 `GripVertical` 图标 + 「长按拖动」提示（仅在 >1 张图时显示一次于顶部说明文字里：`第一张为主图 · 长按可拖动排序`）。
- 主图角标、删除按钮、设为主图按钮保持不变。

## 改动文件

- `src/components/library/KnowledgeRichEditDialog.tsx`：图片网格替换为 `<DndContext><SortableContext>`，每张图抽成内部 `SortableImage` 组件。
- 如未安装则 `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`。

不影响保存逻辑：`gallery` 顺序变化后 `gallery[0]` 仍作为 `cover_url`。
