
# 素材库图片加载优化

只动素材库的取数和缩略图链路，不改业务逻辑、不动样式风格。

## 现状瓶颈

- `MarketingLibrary.tsx` 一次性 `select *` 拉 200 条，把 `meta`（含分段 URL、prompt、错误日志）也下发，首屏 JSON 经常几百 KB。
- `thumbUrl()` 默认请 320px JPEG quality 72，但九宫格在 390px 屏上每格 ≈120 CSS px，dpr=2 也只要 240px；现在多请了 30%~50% 像素。
- 没有 `format=webp`，Supabase Render 支持但目前没开。
- 没有对 storage 域名做 `preconnect`，每张图都要重新 TLS 握手。
- 渲染 200 个 `<img loading="lazy">`，但没有占位/骨架，用户看到的就是"灰底很久才出图"。
- `LibraryAssetPickerDialog` 走的是同样的链路、同样问题。

## 改动清单

### 1) `src/lib/imageUrl.ts`
- `thumbUrl` 默认宽度从 480 降到 240，质量 70。
- 新增可选 `format` 参数，默认输出 `format=webp`（Supabase render 支持，体积 -30~50%）。
- 新增 `thumbSrcSet(url, baseWidth)` 输出 `1x/2x` 两档 webp，配合 `<img srcset sizes>` 让高 dpr 屏精确取图。

### 2) `src/pages/marketing/MarketingLibrary.tsx`
- `fetchItems`：
  - `select(...)` 显式列：`id, kind, output_url, input_image_urls, tags, category, shop_id, user_id, created_at, meta`。维持 meta（视频进度、poster_url 依赖它），但去掉 `select *` 隐性带出的将来新增大列。
  - 首屏 `limit` 由 200 → 60，新增 `loadMore`：底部 IntersectionObserver 触底再追加 60 条（`range(offset, offset+59)`）。
  - 失败视频/补标签等按钮的判定依旧基于已加载列表，不影响。
- 媒体格子：
  - `img` 加 `width`/`height`（占位避免 reflow）、`sizes="(min-width:768px) 20vw, 33vw"`、`srcSet`（240/480）、`fetchpriority` 前 6 张设为 `high`，其余 `auto`。
  - 包一层「未加载前显示 `Skeleton`」的状态：用 `onLoad` 把 `loaded` 标记 set，未 loaded 时叠一个 `animate-pulse` 占位，告别"灰底空窗"。
- 移除一次 `thumbUrl` 内联计算 → 用 `useMemo` 按 `it.id+rawThumb` 缓存，避免每次 setState 重算 200+ 字符串。

### 3) `src/pages/marketing/dispatch/LibraryAssetPickerDialog.tsx`
- 同样改 `select` 列 + 默认 60 条 + WebP 缩略图 + `Skeleton` 占位。
- 弹窗滚动到底再追加下一页（弹窗内 IntersectionObserver，避免一次 120 张同时下载）。

### 4) `index.html`
- 在 `<head>` 增加：
  ```html
  <link rel="preconnect" href="https://<project-ref>.supabase.co" crossorigin />
  <link rel="dns-prefetch" href="https://<project-ref>.supabase.co" />
  ```
  用 `VITE_SUPABASE_URL` 的 host 注入（构建期常量，可直接写死项目当前 host）。

## 不动的部分

- 数据库 schema、RLS、Edge Function、视频拼接逻辑、标签/品类编辑、Realtime 订阅、错误重试、删除流程一概不动。
- `AssetTagDialog`、`UploadAssetDialog`、视频详情等无关组件不变。
- 字体、配色、布局保持现状。

## 验收

- 首屏请求体大小（marketing_assets 的 JSON）下降明显（meta 仍在，但行数从 200 → 60）。
- 图片 URL 带 `format=webp&width=240`，DevTools 看到的单图传输量从 ~30-60KB 降到 ~8-18KB。
- 滚动到底自动加载下一页；标签筛选、店铺切换重置分页。
- 弱网/慢图时格子先显示骨架不是灰块。
