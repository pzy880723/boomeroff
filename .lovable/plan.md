## 问题定位

`notification-images` bucket 是私有的，但 AI 生成 banner 的 edge function `generate-notification-banner` 存完文件后返回的是 `.../object/public/...` 这种公开 URL，浏览器请求直接 400，所以 banner 显示不出来。手动上传走的是 signed URL，能正常显示——但这条链路对用户来说不够顺，且历史数据里已经有一批坏 URL。

## 方案

把 `notification-images` bucket 切成 **public**（bucket 里只放通知/资讯的封面图，没有敏感内容，公开访问是合理的），一次性解决三个问题：

1. AI 生成的 banner 立刻能显示。
2. 前端上传逻辑可以从 signed URL 简化为 `getPublicUrl`，URL 永久有效、不会过期。
3. 历史数据里已经存的 `/object/public/...` URL 自动生效，无需数据迁移。

## 改动项

1. **切换 bucket 为 public**：调用 `supabase--storage_update_bucket({ name: 'notification-images', public: true })`。如果 workspace 策略禁止公开 bucket，回退到方案 B（见下）。
2. **简化 `src/lib/uploadNotificationImage.ts`**：把 `createSignedUrl` 改回 `getPublicUrl`，去掉 10 年 TTL 逻辑。
3. **确认 `generate-notification-banner` edge function** 已经用 `getPublicUrl`（不改）。
4. **RLS 策略检查**：确保 `storage.objects` 上 `notification-images` bucket 有 public SELECT 策略；INSERT/UPDATE/DELETE 仍限制在 `auth.uid()` 自己的目录下。

## 方案 B（如果 workspace 禁止 public bucket）

保持 bucket 私有，改 edge function `generate-notification-banner`：把 `getPublicUrl` 换成 `createSignedUrl(path, 60*60*24*365*10)`，并且写一个一次性脚本把已有 `notifications.image_url` 里 `/object/public/` 的路径重签为 signed URL。这条路的缺点是 signed URL 迟早会过期，10 年后还是会挂。

## 验证

- 切换后刷新当前详情页 `/notifications?open=b88c4c22-...`，banner 应立即显示。
- 在编辑页重新上传一张图 + AI 生成一张 banner，两条路径都能出图。
