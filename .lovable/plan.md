## 审计结论

### `resize=cover`：✅ 已全站清零
仅 `src/lib/imageUrl.ts` 一处定义，且写的是 `resize=contain`。没有任何地方再让 CDN 裁图。

### `object-cover`：✅ 全部合理
剩余 30 处使用都属于以下三类，没有错用：
1. **列表方格**（MyLibrary/OfficialLibrary/History）— 上轮已确定按最小边裁切，符合需求
2. **小头像/缩略图**（dashboard、admin、聊天补拍）— 圆角小框该裁
3. **相机/视频预览**（CameraStage/LiveStreamPanel L689/696）— 摄像头流必须 cover

**唯一可以考虑改的灰区**：`OfficialDetail.tsx:237` 主图（4:3 hero）当前也是 `object-cover`，会裁竖图。但 hero 区按 4:3 裁更整齐，这个保持 `cover` 也合理。**默认不改**，除非你要详情主图也保持完整。

## 性能优化清单

### 1. 详情页大图走 1080px CDN 缩略（避免拉原图）

详情页目前直接 `<img src={original_url}>`，原图常常 2~5MB。统一走 `thumbUrl(url, 1080, 78)`，体积一般缩到 100~250KB，**视觉无差别**，移动端打开速度提升显著。

涉及：
- `OfficialDetail.tsx:237`（hero 大图）
- `OfficialDetail.tsx:388`（图集缩略 → `thumbUrl(url, 240)`，本身已 w-28 h-28）
- `OfficialDetail.tsx:401`（底款 → `thumbUrl(url, 320)`）
- `MyLibrary.tsx:662`（收藏详情 dialog 主图 → 1080）
- `History.tsx` 详情展开主图 → 1080
- `Community.tsx:403`（中古圈详情 sheet 主图 → 1080）
- `components/history/ProductDetailDialog.tsx:156` → 1080
- `components/admin/AiKnowledgeDialog.tsx` 多处管理面板大图 → 1080
- `components/admin/CommunityModeration.tsx:86`（w-10 h-10 → `thumbUrl(url, 96)`）
- `components/admin/OfficialKnowledgeManager.tsx:190`（w-10 h-10 → 96）
- `components/admin/KnowledgeManager.tsx:283`（w-10 h-10 → 96）

### 2. 仪表盘小卡缩略图走 96px

- `DailyKnowledgeCard.tsx:186` / `:295`：w-12 h-12 当前加载原图，改成 `thumbUrl(image_url, 96)`
- `RefineDialog.tsx:272` / `InlineRefineChat.tsx:379`：w-14 h-14 → `thumbUrl(url, 128)`
- `CorrectionReviewPanel.tsx:115`：w-20 h-20 → `thumbUrl(url, 160)`

### 3. 中古圈瀑布流

`Community.tsx:358` 已优先用 `thumbnail_url`（上传时生成的 30~80KB JPEG），未命中再 fallback `thumbUrl(image_url, 480)`。这是最优策略，**不动**。
但可顺手把 `thumbUrl` fallback 的宽度提到 `640`（瀑布流单列宽度 ~190px @2x = 380px，480 足够；保持 480 OK）。**保留现状**。

### 4. AI 识物（Scan/LiveStreamPanel）

- 摄像头/捕获图都是本地 dataURL，**无法走 CDN**，已是浏览器内最小处理路径
- LiveStreamPanel L780 多角度缩略也是本地 dataURL，跳过
- 现有 `uploadImage` 已压缩（image-upload-workflow），无优化空间
- 关键加速点 = 详情卡里展示的 `productImageUrl`（已上传后的远程图）。检查 `ProductDetailCard` 与 `LiveStreamPanel` 中显示 `productImageUrl` 的 `<img>`，套上 `thumbUrl(productImageUrl, 800)` 即可

### 5. 缓存头（可选，长期收益）

`thumbUrl` 生成的 CDN URL 自带强缓存，无需改。

### 6. `fetchpriority` 与 `decoding`

- 详情页 hero `<img>` 加 `fetchpriority="high" decoding="async"`
- 列表已经 `loading="lazy" decoding="async"`，保持

## 不做的事

- 不改 `object-cover`（剩余全部合理）
- 不改 `thumbUrl()` 实现（contain + q=72 已是最佳）
- 不改上传压缩流程
- 不改详情页主图为 `object-contain`（4:3 hero cover 更整齐，除非你要求改）

## 预期收益

- 详情页/管理后台大图：单图体积 -80% 量级（2MB → 200KB）
- 仪表盘/审核面板小缩略：单图体积 -90%+（300KB → 10KB）
- 列表首屏：已在上轮优化完毕，本轮不动

实施后建议刷新一次（CDN 旧链接还有几分钟缓存）。
