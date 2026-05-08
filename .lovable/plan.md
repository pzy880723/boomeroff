## 改动范围

### 1. `src/components/library/KnowledgeRichEditDialog.tsx`（编辑弹窗）
- 把底部的「保存 / 取消」改为**一行并排**，并**固定在 Dialog 底部**（吸底）。
  - 实现方式：把 `DialogContent` 改成 flex 列布局，里面分成「可滚动的表单区」+「固定的 footer」两块；footer 用 `sticky bottom-0` + 背景色 + 上边框，不再用默认的 `DialogFooter`。
  - 两个按钮平分宽度（`flex-1`），保存在右、取消在左，颜色保持现状。
- 在**滚动表单的最末尾**（重要程度字段下方），新增一块「危险操作区」：
  - 一个红色的「删除此词条」按钮（`variant="destructive"`，带 `Trash2` 图标）。
  - 这个区块**不固定**，必须滚到最底才能看到。
  - 点击后弹 `AlertDialog` 二次确认，确认后调用 `supabase.from('official_knowledge').delete().eq('id', draft.id)`，成功后 toast、关闭编辑弹窗、回调通知父组件。
- 给 `Props` 增加 `onDeleted?: () => void` 回调，删除成功时触发；同时仍调用 `onOpenChange(false)`。

### 2. `src/pages/OfficialDetail.tsx`（前端展示页）
- 给 `<KnowledgeRichEditDialog>` 传入 `onDeleted` 回调：
  - 关闭弹窗，toast「已删除」。
  - `navigate(-1)` 或回退到 `/library`（与现有「返回」按钮一致的逻辑）。
- 不需要在展示页本身加独立删除按钮——删除入口只藏在编辑弹窗最底部，避免误触，符合"只有翻到最下面才能看到"的要求。

### 3. RLS 检查
- `official_knowledge` 已有 `Only admins delete official knowledge` 策略，管理员账号可直接删除，无需迁移。

### 不改动
- 后台管理 `OfficialKnowledgeManager.tsx` 已有自己的删除按钮，保持不变。
- `AlertDialog` / `Dialog` / `Button` 等组件无需修改。

## 视觉/交互要点

- 吸底栏样式：`sticky bottom-0 bg-background border-t -mx-6 px-6 py-3 flex gap-2`（配合 `DialogContent` 的 `p-6` 收边）。
- 删除区与表单留出 `mt-8 pt-4 border-t border-destructive/20` 的分隔，标题用浅色「危险操作」字样，给用户明确的"已经到底"提示。
- 移动端（390px 宽）下，吸底两按钮各占一半宽度，单手可点。