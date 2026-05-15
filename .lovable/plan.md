## 问题诊断

「中古圈」（`/u/community` 和 `/community`）一次性请求 80 条帖子，每条 `image_url` 指向 `product-images` 桶里游客上传时存的 **1280px JPEG（约 200–500KB/张）**。也就是说，列表瀑布流首屏要拉 **80 张 × 平均 ~300KB ≈ 20 MB+** 的原图，没有任何尺寸变体，所以非常慢。

具体几个叠加因素：
1. 列表里直接 `<img src={post.image_url}>`，用的是完整识别图，没有缩略图。
2. `<img>` 缺 `width/height`/`aspect-ratio`，瀑布流加载时不停回流，体感更卡。
3. 一次拉 80 条，没有「加载更多」。
4. 详情弹窗用的也是同一张原图，没必要在列表用同一份。

---

## 修复方案

### 1) 数据库：新增缩略图字段
对 `public.community_posts` 增加列 `thumbnail_url text null`。
不需要回填——老帖子读时会自动 fallback 到 `image_url`。

### 2) 上传时同步生成缩略图（≤ 480px JPEG q=0.78）

新增 `src/lib/imageThumb.ts`：纯前端 canvas 把任意 dataURL/URL 缩成 480px 宽的 JPEG，~30–60KB。

**游客通道**（`PublicResult`/`PublicScan` 触发 `submit-public-post`）：
- 客户端生成 thumbnail base64，作为 `thumbnailBase64` 一起 POST。
- `supabase/functions/submit-public-post/index.ts` 增加上传第二张图到 `product-images/guest/thumb/...`，写入 `thumbnail_url`。

**店员通道**（`ShareToCommunityButton`）：
- 提交前先 `fetch(imageUrl)` → 在前端缩成 480px → 上传到 `product-images/community-thumb/...` → 写入 `thumbnail_url`。

### 3) 列表渲染优化（`PublicCommunity.tsx` 和 `Community.tsx`）
- `select` 增加 `thumbnail_url`。
- `<img src={post.thumbnail_url || post.image_url}>`。
- 加 `decoding="async"`；前 4 张 `fetchpriority="high"`，其余 `fetchpriority="low"` + `loading="lazy"`。
- 给 `<img>` 加固定 `width={480} height={480}` 和 `aspect-ratio` 的兜底容器（`bg-muted` + `aspect-square` 占位），等图加载完再撑开真实比例。

### 4) 分页
- 默认拉 24 条，底部显示「加载更多」按钮，每次再追加 24。
- 用 `range(offset, offset+23)` 配合 `.order('created_at', { ascending: false })`。
- 详情弹窗仍然用原图 `image_url`，保证清晰度。

### 5) 详情用原图，但延迟加载
- `PostDetailSheet` 里详情大图加 `loading="lazy"` + `decoding="async"`，并保留 `thumbnail_url` 作为 LQIP 占位（先显示模糊缩略图，再切到原图）。

---

## 涉及文件

```text
supabase/migrations/<new>.sql                   ← 加 thumbnail_url 列
supabase/functions/submit-public-post/index.ts  ← 接收并上传缩略图
src/lib/imageThumb.ts                           ← 新工具：dataURL/URL → 480px JPEG
src/pages/public/PublicResult.tsx               ← 提交分享时附带 thumbnail
src/pages/public/PublicCommunity.tsx            ← 用 thumbnail_url + 分页 + 懒加载
src/pages/Community.tsx                         ← 同上（店员端）
src/components/community/ShareToCommunityButton.tsx ← 上传 thumbnail
```

---

## 预期效果

- 首屏 24 张 × ~50KB ≈ **1.2 MB**（原来 ~20+ MB），首屏图片下载量降到 **~5%**。
- 老帖子无缩略图时仍用原图，不会破图。
- 上传多一步缩略图生成（前端 canvas，<200ms），用户无感。
- 列表不再回流，滚动顺滑。

是否按此实施？