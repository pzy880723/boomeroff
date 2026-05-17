## 目标

列表缩略图按"最小边居中裁切"显示成正方形：竖图裁上下、横图裁左右，画面铺满方格不留白。

## 根因回顾

上一轮为了避免 CDN `resize=cover` 把图片裁成一小块，把列表 `<img>` 改成了 `object-contain bg-muted/30`，结果竖图/横图两侧都留出大片底色。其实只要 CDN 不裁、把完整图发给浏览器，再用 CSS `object-cover` 居中裁切就是用户想要的效果。

## 改动

### 1. `src/lib/imageUrl.ts` 保持不变
`thumbUrl()` 继续用 `resize=contain`，CDN 按宽度等比缩放给完整画面，不裁。

### 2. 列表缩略图：`object-contain bg-muted/30` → `object-cover`
让 `aspect-square` 容器配合 `object-cover` 自动按最小边居中裁切。

涉及文件与行：
- `src/pages/OfficialLibrary.tsx` L337（大卡片）、L369（小列表项 14×14）
- `src/pages/MyLibrary.tsx` L447（列表卡片）
- `src/pages/Community.tsx` 列表 `<img>` 改回 `object-cover`
- `src/pages/History.tsx` 列表缩略图 `<img>` 改回 `object-cover`
  - 注意：详情页/全屏大图保持 `object-contain`，不动
- `src/pages/public/PublicCommunity.tsx` 若有列表 `<img>` 同步改回 `object-cover`

### 3. 不做的事

- 不改 `thumbUrl()` 参数
- 不改详情页/全屏图（依旧完整显示）
- 不改文件压缩、Firecrawl、lightbox

## 效果

竖图：左右铺满、上下居中裁；横图：上下铺满、左右居中裁；正方形：完全铺满。列表回到统一整齐的方格观感，但 CDN 给的仍是完整图，所以不会再出现"只看到一小块"的问题。
