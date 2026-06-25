## 问题诊断

1. **卡在"拼接中"的旧视频**:历史任务里有一批 `marketing_assets.meta.status` 处于 `stitching` 或 `ready_to_stitch`,但分段 URL(火山方舟,24h 过期)早就失效了,前端每次进入页面看到的就是"拼接中… / 失败"循环。这些任务无法再被救活,只能清理。

2. **点击视频卡片"跳到老生成界面"**:目前点击会打开 `AssetDetailDialog`,但当 `output_url` 为空时只显示一句"还在排队渲染",而恢复中的 `SurpriseVideoDialog` / `MarketingVideo` 草稿(`localStorage.surprise-job-*`)会在首页/营销中心重新弹起来抢占焦点 → 看上去就是被甩回了上一次生成视频的页面。

3. **根因(为什么会再次出现)**:`runStitch` 没有超时;`poll-marketing-video` 即使分段已过期也只回报 `status`,前端只在拼接抛 403 时才更新为 `failed`。一旦用户在拼接前关掉页面,任务会永久停留在 `ready_to_stitch`,下次再回到素材库已经过 24h,分段直接 403。

## 修复方案

### A. 一次性清理历史卡死任务
- 新建迁移:把所有 `kind='video'` 且 `created_at < now() - interval '24 hours'` 且 `meta->>status` 不在 `('succeeded','failed')` 的 `marketing_assets` 整条 **物理删除**(对应 `marketing_video_jobs` 也一起删),再把同口径的 `marketing_video_jobs` 余项标记 `failed`。
  - 用户原话"失败的删除即可",所以直接 DELETE,不留尸体。

### B. 防止再次卡死(后端 + 前端双保险)
1. **前端 `MarketingLibrary.runStitch`**
   - 加 90 秒整体超时(`Promise.race`);超时即标 `failed`、写入 `error: 拼接超时,请重新生成`。
   - 进入函数时如果 `asset.created_at` 已超过 23 小时,直接跳过拼接、标 `failed: 分段链接已过期`。
2. **轮询逻辑**
   - 对 `ready_to_stitch` 但 `created_at` 已 > 23h 的资产,不再调 `runStitch`,直接 update 为 `failed`。
3. **失败资产自助删除**
   - 卡片右上角在 `failed` 状态显示一个小 ✕ 按钮(管理模式外也可用),点击二次确认后删 `marketing_assets` + `marketing_video_jobs`。
   - 页面顶部新增"清理失败视频"按钮:批量删除当前店铺所有 `meta.status='failed'` 的视频,带 toast。

### C. 点击视频不再跳回生成页
- `AssetDetailDialog` 对没有 `output_url` 的视频:
  - 显示状态文案 + (若 `failed`)给出"删除此任务 / 重新生成"两个按钮,**不再** 路由跳转。
  - 删除按钮调用同一删除逻辑。
- `MarketingLibrary` 挂载时**清理孤儿草稿**:遍历 `localStorage`,凡是 `surprise-job-*` / `marketing-video-draft-*` 指向的 `job_id` 在数据库里已 `failed`/不存在的,直接 `removeItem`,避免 SurpriseVideoDialog 自动恢复弹窗把用户卷回旧界面。

### D. 文案与状态显示
- 失败卡片明确显示「已失败 · 点击删除」而不是当前会让人误解的"拼接中…"。
- `runStitch` 之前在 `stitchingRef` 注释里写"同会话不重试",改成"已失败永不重试"并在 DB 层落地,刷新页面也不会再触发。

## 涉及文件

- `supabase/migrations/<new>.sql` — 清理脚本
- `src/pages/marketing/MarketingLibrary.tsx` — 超时、过期短路、失败删除按钮、孤儿草稿清理
- `src/components/marketing/AssetDetailDialog.tsx` — 失败视频的删除/重新生成按钮、移除任何跳转

## 不在本次范围

- 不改视频渲染/拼接算法本身(分段下载、ffmpeg.wasm 流程保持原样)
- 不动 Seedance 模型选择、惊喜一下脚本生成等逻辑
