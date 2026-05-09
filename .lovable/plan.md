## 三个问题的修复方案

### 1. 后台用户列表看不到待审核用户

**原因**：`UserTable.tsx` 用 `profiles!user_roles_user_id_fkey(...)` 来联表，但 `user_roles_user_id_fkey` 这个外键指向的是 `auth.users`，不是 `profiles`。PostgREST 找不到对应关系会让整条查询返回空，所以管理员后台一个用户都看不到（包括 3 个待审核的 lifan / lifan_ / pzy5565283）。

**修复**：在 `UserTable.fetchUsers` 中拆成两步——
- 先 `select id, user_id, role, created_at, suspended, suspended_at` 查 `user_roles`
- 再用拿到的 `user_id` 列表去 `profiles` 里 `select user_id, display_name, avatar_url`，在前端 map 拼到一起

### 2. 后台"知识库"菜单是重复且空的，删除它

`Portal.tsx` 当前 7 个 Tab：用户管理 / **知识库** / 官方知识 / 中古圈 / 纠错审核 / AI 模型 / 闲鱼行情。其中"知识库"对应的是早已废弃的 `product_knowledge` 表（之前已删空、个人知识入口也已下线），保留只会让人困惑。

**修复**：
- 从 `Portal.tsx` 移除 `knowledge` Tab 与对应的 `<KnowledgeManager />` 引入
- 文件 `src/components/admin/KnowledgeManager.tsx` 暂保留不删（避免影响其他可能的引用，后续可清理）

### 3. 后台一级菜单改成左上角抽屉式

当前是横向 TabsList，菜单一多就要横向滚动，在手机上很挤。改成：
- 顶部条左侧放一个汉堡按钮（图标 `Menu`），点击弹出 `Sheet`（从左侧滑入）
- Sheet 内是一个垂直菜单列表，每项带图标 + 名称，点击切换并自动关闭抽屉
- 顶部条中间显示当前所在的菜单名（例如"用户管理"），让用户清楚位置
- 退出后台按钮保留在顶部条右侧
- 内容区域保留不变，仍按当前选中项渲染对应面板

只改 `Portal.tsx`，不动各子面板组件。底层仍用 `Tabs` 的 `value/onValueChange` 状态，只是 `TabsList` 换成抽屉里的按钮列表。

### 涉及文件
- `src/components/admin/UserTable.tsx`（修复查询）
- `src/pages/Portal.tsx`（删除知识库 Tab + 改为抽屉菜单）

确认后我就按此实施。
