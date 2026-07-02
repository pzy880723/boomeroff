## 修复 4 件事

### 1. 右上角 Logo 换回图形（透明背景）
- 目前 `Home.tsx` / `PageHeader.tsx` 用的是 `BrandWordmark` 矢量文字 —— 弃用它。
- 用 `imagegen--edit_image` 处理 `src/assets/boomer-go-logo.png`（红底方形图），去掉外围白色 → 透明 PNG，输出 `src/assets/boomer-go-logo-transparent.png`。
- 顶栏改回 `<img>` 显示这个透明 logo（`h-8 w-8` 左右）。
- 保留 `BrandWordmark.tsx` 文件（不删）但不再引用。

### 2. 「我的应用」图标统一红底
- `src/components/home/appIconRegistry.ts`：把所有 tile 的 `tone` 全部改成 `'red'`。
- `AppGrid.tsx` 里 tone 白色分支的样式保留（以防以后用），但注册表里不再产出白 tile。

### 3. 首页瀑布流拉伸修复
- `HomeFeedTabs.tsx`：`<img>` 目前同时写了 `style={{aspectRatio:'3/4'}}` 和 `h-auto` —— 强制 3:4 就是"拉伸"的根源。
- 改为真·瀑布流：移除 `aspectRatio`，图片按自然比例 `w-full h-auto`；占位图（无 cover）才保留 3:4 灰块。

### 4. 首页两个 Feed 的跳转 & 内容
现在的 bug：
- `/community` 在 `App.tsx` L96 被 `Navigate → /notifications`，所以点 BOOMER 圈跑去通知页。
- "我的知识" 卡片点了跳到 `/my-library` 页面，不是弹窗。
- BOOMER 圈卡片没有 昵称/点赞/评论。

改法：
- **删除** `App.tsx` L96 那条 `/community → /notifications` 的重定向，让 `/community` 走它原本的 `<Community />` 路由（授权用户版）。
- `HomeFeedTabs.tsx` 改为**点击弹出弹窗**，不再 `<Link>` 跳转：
  - 「我的知识」Tab：卡片点击 → 打开 `MyLibrary` 页内的知识详情弹窗（复用 `MyLibrary.tsx` 里已有的 `ProductDetailDialog` / 知识详情组件）。为避免整页嵌入太重，抽出复用最小化路径：直接根据 `source_type` 打开对应的 detail dialog（official → `OfficialDetail` 弹窗形态；product → `ProductDetailDialog`）。上方保留官方内容混排（`user_favorites` 已含 official 源），下方保留「测试一下」按钮不变。
  - 「BOOMER 圈」Tab：卡片补充展示 `guest_name / likes_count / comments_count`（community_posts 表已有字段），点击弹出复用 `PublicCommunity.tsx` 里的 `PostDetailSheet`（导出后在此复用）。

### 技术细节
- `PublicCommunity.tsx` 里的 `PostDetailSheet` 组件目前是文件内私有，改为 `export`，供 `HomeFeedTabs` 引用。
- 弹窗层级 z-50 已足够，无需额外调整。
- 不改数据库、不改任何 edge function。

### 影响文件
- `src/assets/boomer-go-logo-transparent.png`（新）
- `src/pages/Home.tsx`（换 logo）
- `src/components/layout/PageHeader.tsx`（换 logo）
- `src/components/home/appIconRegistry.ts`（全部 red）
- `src/components/home/HomeFeedTabs.tsx`（弹窗化 + 图片自然比例 + 圈内 meta）
- `src/pages/App.tsx`（删 `/community` 重定向）
- `src/pages/public/PublicCommunity.tsx`（导出 `PostDetailSheet`）
