## 目标

修复首页「我的知识 / BOOMER 圈」双 Tab 三个问题：加载慢/不全、图片比例不对、点击跳到了顾客版 `/u` 详情页。

---

## 1. 我的知识：加速 + 全量加载

当前 `HomeFeedTabs` 用两步查询（先查 `user_favorites`，再按 id 分别查 `official_knowledge` / `products`），且硬性 `limit 10`。

**改造**
- 后端新增 `SECURITY DEFINER` RPC `home_my_kb_feed(_user_id uuid, _limit int, _before timestamptz)`：一次 SQL 用 `left join` 直接返回 `user_favorites` + 对应 `official_knowledge` / `products` 的封面、名称、类目，按 `created_at desc` 分页。
- 前端 `HomeFeedTabs` 我的知识 Tab：
  - 首屏取 20 条（一次 RPC，去掉两次 round-trip 与两个 Map 合并）。
  - 底部加「加载更多」按钮 + IntersectionObserver 触底自动加载（游标基于最后一条 `created_at`）。
  - 用 `React.startTransition` + 骨架图，避免切 Tab 白屏。

## 2. BOOMER 圈：正方形卡片 + 店员版详情 + 店员版发帖入口

当前问题：
- 卡片用 `columns-2` + `h-auto`，遇到 16:9 素材会渲染成很宽的图，视觉上像 "16:9 大图"。
- 点击卡片打开 `PostDetailSheet`（来自 `pages/public/PublicCommunity`，是顾客版 /u，带店铺二维码等）。
- 右上角「发一条」按钮 `to="/scan"` 也是顾客扫码入口。

**改造**
- 卡片改为 `grid grid-cols-2 gap-2`，图片容器 `aspect-square object-cover`，标题/点赞信息压在下方一行，跟 `MarketingLibrary` 的方图卡对齐。
- 详情：不再复用 `PublicCommunity` 的 `PostDetailSheet`。
  - 抽出店员版 `StaffPostDetailSheet`（新建 `src/components/community/StaffPostDetailSheet.tsx`），从店员端 `pages/Community.tsx` 已有的详情 Sheet 中提取内容：名称、图片、卖点、故事、点赞/评论、发帖人昵称、"收藏为个人知识"按钮。
  - 移除顾客版专属元素：店铺二维码、加店铺微信、"到店领券" CTA 等。
  - `HomeFeedTabs` 与 `pages/Community.tsx` 都改用这个组件，保持店员端一致体验。
- 右上角行动按钮改为「去 BOOMER 圈」`to="/community"`（店员版）；同时保留一个 `+` 分享入口 `to="/scan?share=1"`（店员识别后可 `ShareToCommunityButton`），文案改为「分享一条」。

## 3. 验收

- 我的知识：首屏 <400ms 出内容；可分页加载全部收藏。
- BOOMER 圈：卡片全部为正方形，点击后打开店员版详情（无店铺二维码、无 /u 元素），关闭返回首页。
- 右上角按钮不再跳 `/scan` 顾客版。

## 技术备注

- 新 RPC 授予 `authenticated` execute；沿用 `has_role`/`auth.uid()` 做行级过滤，无需新增策略。
- `StaffPostDetailSheet` 复用 `Community.tsx` 已有的评论/点赞逻辑，抽成 props 驱动，不动数据层。
- 图片继续走 `thumbUrl(cover, 320)` + `loading="lazy"`。
