## 诊断结论：不是数据库慢，是图片太大

跑了一遍数据：
- 所有业务表加起来才 ~3MB（products 432KB / official_knowledge 840KB），完全不可能慢。
- **真正的瓶颈是图片**：`storage.objects` 里 product-images 桶最大的几张图：**4–5 MB / 张**（原始相机拍摄，未压缩）。
- 列表页（History / OfficialLibrary / MyLibrary / Community 详情）目前直接 `<img src={image_url}>`，没有缩略图、没有 `loading="lazy"`、没有尺寸提示。
- 一个 9 格历史页 = 9 × ~3MB ≈ **27 MB**，第二个店员登录走全国/跨网公网拉这么大图，2G/弱 4G 下就是「转半天」。
- Community 已有 480px `thumbnail_url`（`ShareToCommunityButton` 走 `makeThumbnail`），证明方案可复用。

附带几个次要点：
- `useDashboardData` 一次并行 15 个查询 + Promise.all，本身 60s 缓存，正常情况下不是问题。
- RLS 都走 `user_has_permission` SECURITY DEFINER 函数，已经够快。

## 修复方案（按性价比从高到低）

### 1. 列表页全部上 Supabase 图片变换 + lazy（**最高 ROI，半天就能做完**）
Lovable Cloud 自带 Supabase 图片 CDN 变换。对所有「公网桶 + 原始 image_url」的展示位包一个工具函数：

```ts
// src/lib/imageUrl.ts
export function thumbUrl(url: string | null, w = 480, q = 70): string | null {
  if (!url) return null;
  // 仅对自家 storage 的 public URL 加 ?width=&quality=&resize=cover
  if (!url.includes('/storage/v1/object/public/')) return url;
  const transformed = url.replace('/object/public/', '/render/image/public/');
  return `${transformed}?width=${w}&quality=${q}&resize=cover`;
}
```

替换点（grep `image_url` 出来的所有列表/卡片位置）：
- `src/pages/History.tsx` 卡片缩略图（aspect-square，用 `thumbUrl(image_url, 480)`）
- `src/pages/OfficialLibrary.tsx` 封面
- `src/pages/MyLibrary.tsx` 封面
- `src/pages/Community.tsx` 瀑布流（已有 thumbnail_url，但 fallback 走 `image_url` 时也包一下）
- `src/pages/public/PublicCommunity.tsx` 同上
- `src/components/dashboard/...` 仪表盘小图标用 `thumbUrl(url, 128, 60)`

所有 `<img>` 同时加：
```tsx
<img loading="lazy" decoding="async" src={thumbUrl(...)} ... />
```

详情页/全屏查看才用原图 `image_url`。

**单这一步：列表从 27MB → 约 500KB，肉眼瞬间打开。**

### 2. 给 `products` 表加 `thumbnail_url`（中期保险）
图片变换是 Supabase Pro 功能；如果将来变换 API 不可用或限流，我们要有兜底。
- migration: `ALTER TABLE products ADD COLUMN thumbnail_url text;`
- 识别落库时：在 `useProductRecognition` 上传原图后并行调用 `makeThumbnail(file, 480)` → 上传到 `product-thumb/{userId}/{productId}.jpg` → 写 `thumbnail_url`。
- 历史数据可写个一次性 edge function 回填，或者先空着，新数据先享受。
- 列表读取改用 `thumbnail_url ?? thumbUrl(image_url)`。

### 3. 一次性把存量 5MB png 转 webp/jpg（可选）
跑一个脚本：遍历 storage `product-images/*`，下载、用 sharp 压成 webp（80），覆盖。可以做，但有 #1 之后没那么紧急了。

### 4. 列表请求只 select 真正用到的字段
`History.tsx` select 里塞了 description / dimensions / condition / selling_points / tips —— 列表卡片只显示 name / category / date / image。砍掉这些字段虽然省不了几 KB，但少一次 JSON 解析也省点首屏 JS 时间。

### 5. 给 HTTP 资源加合适的 Cache-Control（验证）
Supabase storage 默认 cache-control 是 `3600`。我们可以在上传时显式传 `cacheControl: '604800'`（7 天），让同一个店员二次进入完全走浏览器缓存。

---

## 建议落地顺序

```text
P0（一上线就有感）       1 + 4
P1（识别管线小改）       2（含 migration + 上传链路）
P2（清扫存量）           3、5
```

## 用户能做的事

如果反馈集中在「**某几个店员**特别慢」，多半是网络。但即便如此，把图压到 500KB 也是从根本上消灭这个问题。Lovable Cloud 实例本身的 CPU/带宽目前看没有压力（数据量太小），暂时不需要升级实例。

---

确认后我会按 P0 先实施：新建 `src/lib/imageUrl.ts`，把上面 5 个列表组件批量替换为 `thumbUrl(...) + loading="lazy"`。