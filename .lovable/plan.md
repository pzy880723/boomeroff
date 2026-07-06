## 背景
排查后确认两件事：

1. **素材库视频打不开**：抽样看 `marketing_assets.output_url`，大量视频直接指向火山 TOS 的签名 URL（`X-Tos-Expires=86400`，24 小时有效）。超过 1 天后所有视频就变成 403，前端 `<video>` 触发 onError → 显示"视频加载失败"。只有个别走了 Supabase Storage 转存的视频（token 有效期 10 年）能正常播。**根因是我们把易失的 TOS 签名链接直接落库，没有转存到自有 Storage。**
2. **下载**：目前 `AssetDetailDialog.downloadAsset` 只做浏览器 blob + `<a download>`，在 Capacitor WebView 里等同于"在应用里打开一个新页"，不会进相册。项目已经装了 `@capacitor/filesystem`，但缺一个真正写入系统相册（Photos / DCIM）的插件。

## 目标
- 素材库所有历史 & 新生成的视频都能长期播放。
- 在打包出来的 APP 里，点"下载"直接落到系统相册（iOS 相册 / Android DCIM），Web 端保留现有浏览器下载行为。

## 改动一：视频永久化（关键修复）

### 后端
- **新增/复用 edge function `mirror-marketing-asset`**：入参 `asset_id`，用 service role 读取 `output_url`，若域名是 `*.volces.com / *.volccdn.com`：
  1. `fetch` 原视频 → 上传到 Storage bucket `marketing-videos/<user_id>/<asset_id>.mp4`
  2. 用 `createSignedUrl(path, 10 年)` 拿长期链接
  3. `update marketing_assets set output_url = <新链接>, meta = meta || {tos_url_original, mirrored_at}` 回写
- **成功回调路径**：在 `poll-marketing-video` / `render-marketing-video` 视频状态变为 `succeeded` 且 `output_url` 是 TOS 域名时，直接同步调用上面的转存逻辑（可抽成同文件里一个 helper），保证**新任务不再落 TOS 直链**。
- **存量修复**：写一个一次性 SQL / RPC 或用同一个函数带 `?backfill=1`，遍历 `kind='video' and output_url like '%volces.com%'` 的记录，逐条尝试转存；转不到（源已过期）的把 `meta.status='expired'`、`meta.expired_at=now()`。

### 前端
- `AssetDetailDialog` 的 `LazyVideoPlayer`：当 `videoError=true` 且 `meta.status !== 'expired'`，加一个"刷新链接"按钮，调用 `mirror-marketing-asset` 后重播；`status==='expired'` 时显示"视频源已过期，请重新生成"，直接复用已有的 `regenerateVideo`。
- `MarketingLibrary` 缩略图列表遇到 `meta.status='expired'` 的视频加一个灰色角标"已过期"，避免用户以为是随机 bug。

## 改动二：下载直接进相册（Capacitor 原生路径）

### 依赖
- 新增 `@capacitor/filesystem`（已有）+ **`capacitor-plugin-dynamic-ios-permissions`不需要**；用社区插件 **`@capacitor-community/media`** 处理"保存到相册"（同时支持 iOS Photos 与 Android MediaStore，视频/图片都行）。

### iOS / Android 配置
- iOS `Info.plist` 增加 `NSPhotoLibraryAddUsageDescription`（"需要保存图片/视频到你的相册"）。
- Android `AndroidManifest.xml` 增加 `READ_MEDIA_IMAGES / READ_MEDIA_VIDEO`（API 33+）与旧版 `WRITE_EXTERNAL_STORAGE`（`maxSdkVersion=28`）。
- `capacitor.config.ts` 无需改动，用户 pull 后跑 `npx cap sync`。

### 代码
- 新建 `src/lib/saveToGallery.ts`：
  ```ts
  export async function saveToGallery(blob: Blob, filename: string, kind: 'video'|'image') {
    if (!Capacitor.isNativePlatform()) return webDownload(blob, filename);
    // blob -> base64 -> Filesystem.writeFile(Directory.Cache)
    // Media.savePhoto / Media.saveVideo({ path: fileUri })
  }
  ```
- `AssetDetailDialog.downloadAsset` 拿到 `blob` 之后走 `saveToGallery`，成功后 toast "已保存到相册"。原来的错误兜底（新窗口打开原链接）保留。
- 图文素材（`kind==='photo'`）同样接入，`ShareMenu` 的"保存长图"也走同一个函数，让"保存到相册"体验一致。

## 技术细节
- Storage bucket `marketing-videos` 已存在（历史转存路径证明）；保持私有 + 长期 signed URL 的现状，避免公开桶策略问题。
- 转存 edge function 使用 service role bypass RLS，写文件路径 `<user_id>/<asset_id>.mp4`，与现有约定一致。
- `@capacitor-community/media` 在 Android 13+ 需要 runtime 请求 `READ_MEDIA_*`，插件本身处理；iOS 首次调用弹权限。
- 用户交付流程：本次改完后需要 `git pull → npm install → npx cap sync → 重新出包`，我会在最后一步的回复里提示。
- 参考文档：[Capacitor 移动开发指南](https://lovable.dev/blog/mobile-development-with-capacitor)

## 不改动
- 现有 `download-marketing-asset` edge function（作为 Web / 兜底通道保留）。
- `ShareToCommunityButton` / 识别流程 / RLS。
