## 目标
素材库列表和详情页视频要"秒开 + 流畅",当前的卡顿主要来自:
1. 详情弹窗里用了 `preload="auto"`,打开就拉整条视频。
2. 部分视频卡片在没有 cover 时直接渲染 `<video>` 标签,会同时拉多条视频流。
3. 视频上传到 `marketing-videos` 时没有显式的 `cacheControl`,导致 CDN/浏览器缓存命中率低,二次打开依旧走源站。
4. 详情页没有用低分辨率封面打底,黑屏等数据。
5. 拼接后未生成轻量首帧 poster,只能复用大图 `cover_url`。
6. 没有对 storage 域名做 `preconnect`,首次握手慢。

## 改动范围(只动前端/存储参数,业务逻辑不变)

### 1. 详情弹窗按需加载 `AssetDetailDialog.tsx`
- 把 `<video preload="auto">` 改为 `preload="metadata"`,默认只拉 moov + 首屏。
- 包一层"点击播放"覆盖层:首次进入只展示 poster,用户点击播放按钮才创建/挂载 `<video>` 并 `play()`。这样列表里反复打开视频不会每次都触发整条下载。
- poster 优先用 Supabase Storage 转换后的 480 宽缩略图(`thumbUrl(cover, 480)`),保证瞬时出图。

### 2. 列表卡片不再触发视频请求 `MarketingLibrary.tsx`
- 删除第 604–605 行的 `<video src=...>` 回退路径,统一改为:有 cover/输入图就用图;都没有就显示一个"视频"图标占位。
- 给所有 `<img>` 缩略图统一接 `thumbUrl(..., 320)`,避免拉原图。

### 3. 上传/落库时打满缓存头 `MarketingLibrary.tsx::runStitch`、`render-marketing-video` 等所有 `storage.from('marketing-videos').upload`
- 增加 `cacheControl: '31536000', contentType: 'video/mp4'`。
- 上传后顺手抓首帧做 poster:
  - 浏览器端拼接成功的视频(`runStitch`)用现成 `<video>` + `<canvas>` 抽 1 秒处首帧,转 JPEG 上传到 `marketing-videos/posters/{id}.jpg`,写回 `meta.poster_url`。
  - 后端 edge function 暂不抽帧(无 ffmpeg),仅靠 `meta.cover_url` 兜底。
- 详情/列表 poster 解析顺序统一为:`meta.poster_url` → `meta.cover_url` → 首张输入图。

### 4. 网络预热 `index.html`
- 新增 `<link rel="preconnect" href="https://narqwgwpqglathwtyevz.supabase.co" crossorigin>`,提前完成 DNS/TLS,首屏视频/图片省 100–300ms。

### 5. 已签 URL 复用
- `output_url` 当前是 1 年签名 URL,本身可缓存;确认带上面的 `cacheControl: 31536000` 后,Cloudflare/浏览器都能命中。无需改 URL 形态。

## 不在范围
- 不动 Seedance 渲染管线、不动 RLS/数据库结构。
- 不引入新的转码/转封装服务(后续如要 HLS 切片再单独立项)。

## 预期效果
- 列表二次打开:几乎 0 网络,直接从缓存出图。
- 详情首次打开:先出 poster,点击播放后再拉视频,体感"秒开"。
- 反复浏览不会再触发多条视频并发下载,移动端流量和卡顿明显下降。