## 问题

在「素材库 → 视频详情」里，「视频广告文案」目前的行为：

1. 打开视频详情时会**自动生成一次**文案；
2. 生成结果只写到父组件的本地 state（`onUpdated`），**没有写回数据库** `marketing_assets.meta.video_copy`；
3. 所以关闭再打开、或刷新页面后 `asset.meta.video_copy` 仍是空，自动生成又跑一次，用户每次都要等，还会重复消耗 AI 额度。

## 目标

- 已经成功生成过文案的视频 → 再次打开时直接展示，**不重跑**；
- 只有用户点击「生成视频广告文案 / 重新生成」按钮，才会调用模型；
- 一旦生成成功，立即持久化到数据库，退出后再进来仍在。

## 改动（只动一个文件）

`src/components/marketing/AssetDetailDialog.tsx`

1. **移除自动生成**：删掉当前 376–385 行的 `useEffect`（视频渲染完成 & 无文案时自动 `generateVideoCopy({ silent: true })`）。
2. **生成成功后写回数据库**：`generateVideoCopy` 里在 `setVideoCopy(got)` 之后，用 `supabase.from('marketing_assets').update({ meta: nextMeta }).eq('id', asset.id)`，把新的 `meta.video_copy` 持久化；失败仅 `console.warn`，不影响 UI（本地已更新）。
3. **保持既有 UI**：
   - 有 `videoCopy` → 显示文案卡片 + 「重新生成」按钮（点击才会重跑并覆盖）；
   - 无 `videoCopy` → 显示「还没生成视频广告文案 🎬」+「生成视频广告文案」按钮，点击后才生成。
4. 其他逻辑（`onUpdated` 通知父组件同步列表 state、复制、下载 + 复制文案等）保持不变。

## 不改动

- Edge Function `generate-marketing-video-copy` 不动；
- 数据结构不动（继续用 `marketing_assets.meta.video_copy`）；
- 图片/文案类素材、脚本编辑等其它 tab 全部保持不变。

## 验证

1. 打开一个从未生成过文案的视频 → 不再自动跑；点击「生成视频广告文案」→ 出结果；
2. 关闭对话框再打开同一视频 → 文案直接显示，控制台/网络没有 `generate-marketing-video-copy` 请求；
3. 刷新整个页面再进入 → 文案仍在（证明已入库）；
4. 点击「重新生成」→ 触发一次请求，新文案覆盖并持久化。
