## 目标

把现在单一的「拍照识别」首页改造成一个有 5 个底部 Tab 的完整 App：官方知识库、个人知识库、AI 识别（中间凸起大图标）、中古圈、我的。

## 整体导航

底部 5 Tab，全平台（含桌面端）统一使用，固定吸底，安全区适配：

```
┌──────────────────────────────────────┐
│                                      │
│             页面内容区                │
│                                      │
├──────────────────────────────────────┤
│  📚    ⭐    ┌──┐    🌐    👤        │
│ 官方  个人  │AI│  中古圈  我的       │
│ 知识  知识  └──┘                     │
└──────────────────────────────────────┘
```

中间「AI 识别」按钮做成圆形凸起（比其他 4 个大约大 50%），强视觉中心。

## 1. 路由与页面结构

新增路由（都包在 `<MainLayout>` 里，自动渲染底部 Tab）：

- `/` → 默认跳转 `/scan`（识别），保留现状
- `/library` 官方知识库
- `/my-library` 个人知识库
- `/scan` AI 识别（即原 `Dashboard` / `LiveStreamPanel`）
- `/community` 中古圈
- `/me` 我的

`/portal`、`/history`、`/invite/:code` 等不显示底部 Tab。

新增组件：
- `src/components/layout/MainLayout.tsx` — 包裹 `<Outlet/>` + `<BottomTabBar/>`
- `src/components/layout/BottomTabBar.tsx` — 5 Tab，固定底部
- 5 个新页面：`OfficialLibrary.tsx`、`MyLibrary.tsx`、`Scan.tsx`(复用 Dashboard)、`Community.tsx`、`Me.tsx`

## 2. 数据库改动（migration）

### 新表 `official_knowledge`（官方知识库）
```
id, category(product_category), ip_name(text, 可空, 用于"凡尔赛""伊万里"等 IP 维度),
name, summary, content(jsonb 富文本/卖点/历史), era, origin,
cover_url, gallery(jsonb 图片数组), source_product_id(可空, 来自哪条 product_knowledge),
created_by, created_at, updated_at
```
RLS：所有认证用户可读；仅 admin 可增删改。

### 新表 `user_favorites`（个人知识库）
```
id, user_id, source_type('official'|'product'|'recognition'),
source_id(uuid, 指向对应表), snapshot(jsonb 反范式存名称/封面，避免源被删后空白),
created_at, unique(user_id, source_type, source_id)
```
RLS：仅本人可增删查自己的收藏。

### 新表 `community_posts`（中古圈）
每次成功识别，自动 insert 一条（默认 `is_public = true`）。
```
id, user_id, product_id(可空), image_url, name, category, era, origin,
selling_points(jsonb), tips, is_public(bool, default true),
likes_count(int, default 0), comments_count(int, default 0),
created_at
```
RLS：is_public=true 的所有认证用户可读；本人可更新/删除；admin 可删除。

### 新表 `community_likes`
```
id, post_id, user_id, created_at, unique(post_id, user_id)
```
RLS：本人可增删自己的点赞；所有认证用户可读。
触发器：insert/delete 时同步 `community_posts.likes_count`。

### 新表 `community_comments`
```
id, post_id, user_id, content(text), created_at
```
RLS：所有认证用户可读；本人增删自己的评论；admin 可删任意。
触发器：insert/delete 同步 `comments_count`。

### `product_knowledge` 增加列
- `is_official boolean default false` — 后台一键提升后置 true，并复制一份到 `official_knowledge`。

## 3. 各 Tab 详细设计

### 📚 官方知识库 `/library`
- 顶部搜索框 + 横向滚动品类 chips（瓷器/线香/漆器…）+ IP 筛选下拉
- 网格 2 列卡片：封面图、名称、品类标签、产地/年代
- 点击进入详情页 `/library/:id`：大图轮播 + 卖点 + 故事 + 「⭐ 收藏到个人知识库」按钮
- 列表分页（每页 20 条）

### ⭐ 个人知识库 `/my-library`
- 顶部分段：全部 / 来自官方 / 来自识别
- 网格卡片，长按或右上 ⋯ 可移除收藏
- 空状态文案：「去官方知识库或识别商品后收藏吧」
- 点击进入相应详情（官方→ `/library/:id`，识别→详情弹窗）

### 📷 AI 识别 `/scan`
- 完全保留现有 `LiveStreamPanel` 行为
- 识别成功后：
  - 仍然 insert `products`（不变）
  - **同时 insert `community_posts`**（默认公开，社区自动出现）
  - 结果卡片增加「⭐ 收藏到我的知识库」按钮（写 `user_favorites`，source_type='recognition'，source_id 用 product.id）
  - 保留现有「加入知识库」按钮（写 `product_knowledge`）

### 🌐 中古圈 `/community`
- 双列瀑布流（CSS columns 实现，移动端 2 列、桌面 3-4 列）
- 每张卡片：商品图（自适应高度）、商品名、品类 tag、底部一行「头像 昵称」「❤️ 12」「💬 3」
- 卡片右上角小图标：⭐ 收藏
- 点击卡片打开底部抽屉详情：大图、完整识别信息、点赞按钮、评论列表、评论输入框
- 顶部品类筛选 chips，下拉刷新 + 触底加载更多
- 实时：用 Supabase Realtime 订阅 `community_posts` insert，新内容顶部气泡「N 条新内容」
- 头像/昵称从 `profiles` join 取

### 👤 我的 `/me`
- 顶部卡片：大头像 + 昵称（点击编辑昵称）+ 角色徽章
- 数据卡片三宫格：识图次数（count products where created_by=me）、收藏数（count user_favorites）、社区动态（count community_posts where is_public）
- 「成长等级」区域：纯静态展示固定文案「Lv.1 中古萌新」+ 进度条占位（不计算）
- 列表项：
  - 历史记录 → `/history`
  - 我的发布 → 个人发布的社区动态列表
  - 修改密码 → 复用 ResetPassword 流程
  - 退出登录

## 4. 后台 `/portal` 增强

`KnowledgeManager` 每行新增「⬆ 提升为官方」按钮：
- 点击后弹窗确认 → 写入 `official_knowledge` + 把 `product_knowledge.is_official` 标记 true
- 已是官方的显示「✓ 官方」徽章

新增「官方知识库」Tab：
- 直接管理 `official_knowledge`（增删改、上传封面、设置 IP）
- 复用 `KnowledgeEditDialog` 逻辑，扩展 IP/封面字段

新增「社区管理」Tab：
- 列表所有 `community_posts`，admin 可删除违规帖与评论

## 5. 技术细节

- **底部 Tab 高度** `64px` + iOS 安全区，Header 同时存在；`Scan` 页面摄像头容器高度计算需扣掉两栏
- **状态共享**：用 React Query 缓存收藏列表、社区列表、官方列表，识别后 invalidate
- **触发器**：Postgres 触发器维护 likes/comments count，避免前端竞态
- **realtime**：`ALTER PUBLICATION supabase_realtime ADD TABLE community_posts, community_likes, community_comments;`
- **图片**：社区帖直接复用 product.image_url，不重复上传
- **隐私**：识图结果默认公开但每条 `community_posts` 提供「设为私密」开关（在我的-我的发布 / 中古圈卡片自己 ⋯ 菜单），写 `is_public=false`
- **桌面端**：底部 Tab 也用，`max-w-screen-md` 居中，两侧留灰
- **品类常量** 复用 `CATEGORY_LABELS`

## 6. 文件清单

**新建**：
- `src/components/layout/MainLayout.tsx`
- `src/components/layout/BottomTabBar.tsx`
- `src/pages/OfficialLibrary.tsx` + `OfficialLibraryDetail.tsx`
- `src/pages/MyLibrary.tsx`
- `src/pages/Community.tsx` + `CommunityPostDialog.tsx`
- `src/pages/Me.tsx`
- `src/components/community/PostCard.tsx`、`CommentList.tsx`
- `src/components/admin/OfficialKnowledgeManager.tsx`
- `src/components/admin/CommunityModeration.tsx`
- 1 个 SQL migration（4 张新表 + 2 个触发器 + product_knowledge 列）

**修改**：
- `src/App.tsx` 路由结构
- `src/components/dashboard/LiveStreamPanel.tsx` 识别成功后写 community_posts + 增加收藏按钮
- `src/components/admin/KnowledgeManager.tsx` 增加「提升为官方」按钮
- `src/pages/Portal.tsx` 增加 2 个 Tab
- `src/integrations/supabase/types.ts`（自动）

## 7. 实施顺序

1. SQL migration（建表 + RLS + 触发器 + realtime publication）
2. MainLayout + BottomTabBar + 路由调整
3. Community 页面（含点赞/评论/收藏）+ Scan 页面写 community_posts
4. Official Library + My Library
5. Me 页面
6. Portal 后台 Official + 提升按钮 + 社区管理

## 8. 范围之外（本轮不做）

- 等级算法、积分、徽章成就（仅静态展示 Lv.1）
- 评论举报、敏感词过滤
- 推送通知
- 关注/粉丝
