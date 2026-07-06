## 目标
解决营销素材库视频的三个体验问题：加载慢 / 封面千篇一律 / 没有标题。

## 1. 视频加载优化
- **详情页 LazyVideoPlayer**：给 `<video>` 加 `preload="metadata"`、`playsInline`；点击后立即 `play()`，同时把 poster 用 `<img fetchPriority="high" decoding="async">` 先撑起画面，避免空白等待。
- **列表页缩略图**：把 poster 用 `srcSet` 缩到 240px（当前已用 `thumb()`，但对 Supabase Storage 的签名 URL 未生效——改成先走 `imageThumb` 缩放，若不支持则退回原图），只有网格首屏的前 6 张 `eager`，其余 `lazy`。
- **首屏体感**：视频块骨架 → poster → 播放按钮的过渡改为 200ms 淡入，避免"整块空白 → 突然出现"的错觉。

（说明：视频体积本身受生成模型控制，无法在前端压缩；这里做的是**首屏可见**与**元数据预取**优化。）

## 2. 更有代表性的封面
问题：
- 旧视频从没生成过 `poster_url`，列表 fallback 到 `input_image_urls[0]` = 参考图（门口那张）。
- 新视频的 poster 是 0.5s 首帧，很多时候就是参考图的静止画面。

方案：
- **抽帧位置改到视频中段**：`extractFirstFrame` 增加 `atSec` 逻辑，默认取 `duration * 0.45`（35%~55% 之间），比 0.5s 更能代表内容；同名 API 加入 `videoDuration` 优先分支，向下兼容。
- **详情页首次播放时自动补 poster**：在 `LazyVideoPlayer` 里，如果 `assetId && !posterUrl && video.readyState >= 2`，在 `timeupdate` 到 40% 时抓 canvas 帧，走一个新的 `refresh-marketing-poster` edge function 存到 Storage，并把 `meta.poster_url` 更新。用户看视频即帮忙"渐进式补封面"，无需批处理成本。
- **手动"换封面"入口**：详情抽屉里加一个小按钮 `换封面`，播放到想要的画面后点一下，把当前帧上传为新的 poster。
- **保留 fallback**：仍然允许 `meta.cover_url / image_urls / input_image_urls` 作为最后兜底，但顺序调整为 `poster_url → cover_url → 空占位（视频图标 + 品牌灰底）`，**不再默认回退到参考图**——避免所有视频看起来都一样。

## 3. 视频标题
- **数据层**：视频素材已有 `meta.topic / meta.style_label`。新增 `meta.title`：
  - `generate-marketing-video-script` 让 AI 额外产出一句 ≤14 字的 `title`（例：`夏日轻穿搭 · 一分钟合集`），写入返回的 script。
  - `render-marketing-video` 落库时把 `script.title` 存到 `meta.title`（缺省时用 `topic` 截断作为回退）。
- **展示层**：
  - **列表页**：每个视频缩略图底部叠一层深色渐变 + 一行 `meta.title` (`truncate`)，与现有 `VIDEO` 角标共存。
  - **详情抽屉**：在视频容器上方新增一行大标题（`font-display text-base`），下方保留 `style_label · 时长` 元信息。
- **旧素材兼容**：读取时 `title = meta.title || meta.topic || '未命名视频'`，无需批量迁移。

## 技术要点
- 涉及文件：
  - `src/lib/extractFirstFrame.ts`（抽帧位置）
  - `src/components/marketing/AssetDetailDialog.tsx`（LazyVideoPlayer 预加载、渐进补 poster、换封面按钮、标题展示）
  - `src/pages/marketing/MarketingLibrary.tsx`（缩略图 fallback 顺序、标题叠层、加载优化）
  - `supabase/functions/generate-marketing-video-script/index.ts`（新增 `title` 输出字段 + prompt 更新）
  - `supabase/functions/render-marketing-video/index.ts`（把 `script.title` 存入 `meta.title`）
  - `supabase/functions/refresh-marketing-poster/index.ts`（**新**：接收 base64 帧，写入 `marketing-videos/<uid>/posters/<assetId>.jpg`，10 年签名，更新 `meta.poster_url`）
- 无数据库结构变更；`meta` 是 JSONB，新增字段无需 migration。
- 兼容旧数据，无破坏性变更。
