## 问题
`src/components/admin/KbManager.tsx` 里的「新增/编辑词条」对话框在小屏（如当前 597px 高）会超出屏幕，且整块没法滚动——`DialogContent` 默认没有限高，里面的字段(分类/标题/AI块/8 行正文/标签/排序)叠起来比可视高度还高，底部「保存」按钮会被裁掉。

## 修复方案
仅改 `KbManager.tsx` 的 `DialogContent`：

1. `DialogContent` 改为弹性高度容器：
   - `max-w-lg max-h-[90vh] flex flex-col p-0 gap-0`
2. `DialogHeader` 加 `px-6 pt-6 pb-2 shrink-0`，保持顶部固定。
3. 把字段那个 `<div className="space-y-3">` 包成可滚动主区：
   - `flex-1 overflow-y-auto px-6 py-2 space-y-3`
4. `DialogFooter` 加 `px-6 py-4 border-t shrink-0`，保持底部按钮始终可见。
5. 顺手把"正文" `Textarea` 的 rows 从 8 改成 6，减少初始撑高（仍可滚动）。

同样的处理顺手套用到「新增/编辑分类」对话框（同文件）以保持一致，但其内容很短，主要保险措施。

## 不改的部分
- 不动业务逻辑、AI 生成、保存流程。
- 不改 `dialog.tsx` 基础组件。
- 不改字体/颜色 token。

改完后在 597px 高视口下：标题与底部按钮固定，中间字段可上下滚动，再也不会被裁。