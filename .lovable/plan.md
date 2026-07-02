# 首页 & 消息中心整理

## 1. 「我的应用」图标全部统一红瓷扁平

`src/components/home/AppGrid.tsx` → `TileFace`：

- 移除顶部 `bg-gradient-to-b from-white/25 …` 高光层。
- 移除 `ring-1 ring-primary/40` 与 `shadow-[inset_0_1px_0_rgba(255,255,255,0.35),…]` 的内描边阴影。
- 保留 squircle 圆角 + 品牌红底 (`bg-primary`) + 白色图标；仅保留一层非常淡的落地投影用于层次感（`shadow-[0_4px_10px_-6px_rgba(0,0,0,0.25)]`）。
- 拖拽时的 `scale-110` 保留。
- `appIconRegistry.ts` 保持全部 `tone: 'red'`，`AppIconTone` 白瓷分支不再产出（保留代码以便将来使用）。

## 2. 右上角 BOOMER GO wordmark 缩小

- `src/pages/Home.tsx` 顶栏 `<img>` 由 `h-5` 改为 `h-4`。
- `src/components/layout/PageHeader.tsx` 顶栏同款 `<img>` 由 `h-5` 改为 `h-4`。

## 3. 消息中心：通知 / 资讯 / 消息 三分栏

### 底部导航（`BottomTabBar.tsx`）
- 「通知」→ 「消息」。
- 图标由 `Bell` 改为 `MessageCircle`（Lucide）。
- 路由仍为 `/notifications`（不动 URL，避免旧收藏失效）。

### 通知页（`src/pages/Notifications.tsx`）
- 顶部新增一行 pill segmented control：`通知 / 资讯 / 消息`，默认选中「通知」，选择态存 `localStorage`。
- 三个分栏基于 `notifications.category` 字段过滤（复用现有字段，无需 DB 迁移）：
  - **通知**：`category IS NULL` 或 `category IN ('notice','announcement','policy','urgent')` — 保留原来的公告类。
  - **资讯**：`category = 'news'` — 新增的资讯（长图/头条式内容），首页 Banner 就取这一类的最新一条。
  - **消息**：`category = 'message'` — 系统消息 / 个人提醒（升级、审核结果、班表变更等，将来接入）。
- 管理员「AI 撰稿浮标」在弹窗内新增「分类」下拉（通知 / 资讯 / 消息），写入 `notifications.category`。
- `PageHeader` 标题跟随当前分栏（"通知" / "资讯" / "消息"）。
- 「全部已读」按当前分栏范围操作。

### 首页 Banner (`Home.tsx`)
- Banner 现在取 `category = 'banner'` 或最新一条；改为**只取** `category = 'news'` 的最新一条（`useNotifications` 已带 `category` 字段，无需 refetch）。
- 无资讯时保留 `bannerDefault` 占位，点击仍跳 `/notifications?tab=news`（跳过去自动切到「资讯」分栏）。

### `useNotifications` 计数
- `unreadCount` 保持全量口径不变（底部小红点仍反映所有未读）。

## 4. 首页「我的知识」瀑布流 → 跳详情 + 返回定位

现在瀑布流点击弹 `Dialog`；改为跳详情页，浏览器返回时保留首页滚动位置。

### 跳转
`src/components/home/HomeFeedTabs.tsx`：
- 我的知识分栏卡片由 `<button onClick={setActiveKb}>` 改为 `<Link>`：
  - `source_type === 'official'` → `to={"/library/" + source_id}`（已存在 `OfficialDetail` 路由）。
  - `source_type === 'product'` → `to={"/my-library?product=" + source_id}` 或直接复用 `MyLibrary` 页内已有的详情打开逻辑（读取 query param 自动打开 `ProductDetailDialog`）。
- 移除该分栏原来的 `activeKb` state 与内置 Dialog（BOOMER 圈的 `PostDetailSheet` 仍保留，圈子帖子继续弹窗）。

### 返回时定位
- 在 `main.tsx` / 根 `App.tsx` 挂载一个轻量的 **ScrollRestoration**：
  - 用 `useLocation()` + `history.state.key` 作为 key。
  - `beforeunload` / route change 前，把 `window.scrollY` 存进 `sessionStorage`（key = 路由 pathname + history key）。
  - `POP` 导航（浏览器返回）时读取并 `window.scrollTo`。
- 只挂一处即可对首页 & 所有子页生效；`PUSH` 导航仍走顶部（符合直觉）。

## 技术细节

- 不新增数据库迁移；`notifications.category` 字段已存在，只是取值扩展 `news / message`。
- `MyLibrary.tsx` 若尚未支持 `?product=<id>` auto-open，需要在其 `useEffect` 里加一段：读 query → 根据 id 从 `products` 拉一次 → 打开现有的 `ProductDetailDialog`。
- ScrollRestoration 只处理 `document.scrollingElement`；如果 `Home` 未来改为内部 scroll 容器，需要 hook 到那个容器。

## 影响文件

- `src/components/home/AppGrid.tsx`（图标扁平化）
- `src/pages/Home.tsx`（wordmark h-4；Banner 只取 news；跳转带 `?tab=news`）
- `src/components/layout/PageHeader.tsx`（wordmark h-4）
- `src/components/layout/BottomTabBar.tsx`（"消息" + MessageCircle 图标）
- `src/pages/Notifications.tsx`（三分栏、按 category 过滤、AI 撰稿加分类字段、支持 `?tab=` 参数）
- `src/components/home/HomeFeedTabs.tsx`（我的知识改 Link 跳转，移除 Dialog）
- `src/pages/MyLibrary.tsx`（支持 `?product=<id>` 自动打开详情）
- `src/App.tsx` 或 `src/main.tsx`（挂 ScrollRestoration）