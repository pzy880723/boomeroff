## 问题
个人知识库（`/my-library`）网格里的"官方收藏"卡片显示的是收藏那一刻写入 `user_favorites.snapshot` 的 `cover_url / name / summary / category`。当官方知识卡（`official_knowledge`）后续被编辑（换图、改名）后，snapshot 不会自动同步，所以网格里看到的是旧主图，只有点开详情时才会刷新（详情已实时拉取源表）。

我建的"个人知识"（`product_knowledge`）则是直接查源表的，所以不存在这个问题——本次只修官方收藏。

## 方案

在 `src/pages/MyLibrary.tsx` 的 `loadAll()` 里，对来源为 `official` 的收藏批量回查最新数据并覆盖 snapshot 字段，再写回网格。

### 改动点

1. **`src/pages/MyLibrary.tsx` — `loadAll()`**
   - 收藏数据加载后，收集所有 `source_type === 'official'` 的 `source_id`。
   - 一次 `supabase.from('official_knowledge').select('id, name, category, cover_url, summary').in('id', ids)` 批量拉新。
   - 用返回的 map 覆盖每条 favorite 的 `name / category / cover_url / summary`（snapshot 仅作为 fallback，遇到源已删除的情况保留旧值并仍可显示）。
   - 对 `source_type === 'product'`（用户拍照分享）同样处理一次 `products` 表，避免同样的陈旧问题。
   - 失败时静默回退到 snapshot，不影响渲染。

2. **可选小改动（同一文件）**
   - 在 `KnowledgeEditDialog` 保存成功的回调路径之外，给 `MyLibrary` 增加一个聚焦时刷新的钩子：用现有 `loadAll`，在 `document.visibilitychange → visible` 时重新拉取一次，确保用户从后台编辑工具切回来即可看到新图（无需依赖 snapshot 同步）。

### 不做的事
- 不改数据库 schema、不加触发器去同步 snapshot（成本高、容易和已有数据不一致）。
- 不改详情页逻辑（已经是实时拉源表）。
- 不动"我建的"个人知识卡（已经实时）。

### 验证
- 打开 `/my-library`，对一条已收藏的官方知识在后台改封面 → 回到 `/my-library` 应立即看到新主图。
- 删除该官方知识 → 网格仍显示旧 snapshot，不报错。
