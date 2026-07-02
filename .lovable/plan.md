## 目标
让管理员在资讯详情弹窗里能编辑/删除资讯，并优化弹窗排版。

## 1. 弹窗（NotificationDetailSheet）视觉调整
- 外层增加左右留白：`DialogContent` 加 `mx-4 sm:mx-auto`，宽度改 `max-w-[calc(100vw-2rem)] sm:max-w-lg`，同时 `rounded-2xl overflow-hidden`，确保四角圆角明显。
- 顶部 meta 行拆成两行：
  - 第一行：类型徽章 + 标题（保持现状）
  - 新增作者行（在标题下、导语上）：左侧头像 + 作者名，**右侧靠右**显示完整发布时间（`YYYY-MM-DD HH:mm`）。
- 原来那个"徽章 + 时间"的组合，把时间从徽章行移到作者行右侧。

## 2. 管理员操作栏
- 在 `NotificationDetailSheet` 底部新增一个 sticky 底栏（仅 `isAdmin` 时出现），包含两个按钮：
  - `编辑`（`Pencil` 图标，主色）
  - `删除`（`Trash2` 图标，`variant="destructive"`），点后用 `AlertDialog` 二次确认"确定删除这条资讯？"。
- 通过 props 传入 `isAdmin`、`onEdit(item)`、`onDelete(item)`。

## 3. 数据层
`useNotifications.tsx` 新增：
- `removeItem(id)`：`delete from notifications where id`，成功后本地 `setItems` 过滤并刷新计数。
- 编辑走 update 而非 insert；在 Context 里加 `updateItem(id, patch)`：`update notifications set ... where id`。

## 4. 编辑流程（复用现有 compose 面板）
在 `Notifications.tsx`：
- 新增 state：`editingId: string | null`。
- 新方法 `openEditFromDetail(item)`：填入 `title/summary/body/type/category/coverUrl`，`setEditingId(item.id)`，`setView('preview')`（跳过 chat，直接进入预览编辑），`setOpen(true)`，同时关闭 detail 弹窗。
- 改造 `publish()`：若 `editingId`，走 `update` 分支（不重置 created_by，不 toast "已发布"，改为"已更新"），成功后清 `editingId`。
- `resetCompose` 里同时 `setEditingId(null)`。
- 底部发布按钮文案根据 `editingId` 切换为"保存修改"。

## 5. 详情弹窗 props 变更
`NotificationDetailSheet` 新增：
```ts
isAdmin?: boolean;
onEdit?: (item: NotificationItem) => void;
onDelete?: (id: string) => Promise<void> | void;
```
在 `Notifications.tsx` 使用处传入这三个 props；`onDelete` 调用新增的 `removeItem` 并关闭 detail。

## 涉及文件
- `src/components/notifications/NotificationDetailSheet.tsx`（排版 + 底栏 + 删除确认）
- `src/hooks/useNotifications.tsx`（`removeItem` / `updateItem`）
- `src/pages/Notifications.tsx`（`editingId`、`openEditFromDetail`、`publish` 支持 update、Detail props）

无需 DB 迁移，无新增依赖。