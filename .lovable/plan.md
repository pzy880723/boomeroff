## 背景

代码里仍混杂着大量 Seedance **1.5 时代**的「首帧 / 尾帧 / image2video / flf2v」概念。2.0 已经在 `submitArkTask` 里强制走 `reference_image` 单通道，但上下游的切段、绑定、文案、错误提示都还是按 1.5「首尾帧锁画面」的模型写的，既有死代码、又有会误导用户的文案，还藏着一个 model id typo。本次清扫把全链路统一到 2.0 心智模型：**reference_image（最多 9 张）+ one_shot / per_shot 两种策略**。

## 要清掉的 1.5 残留

1. **首尾帧索引（firstIndex / lastIndex / firstImage / lastImage）**
   - `supabase/functions/_shared/marketing-segments.ts` `pickSegmentImages` 仍返回 `firstIndex / lastIndex`，调用方再把它们当 ref 推进去，纯属对同一张图去重前的重复 push。
   - `src/lib/marketingSegments.ts` 同步暴露的 `firstIndex / lastIndex` 也已无消费方。

2. **`mode` 三态里的 `image2video`**
   - `render-marketing-video` per_shot 分支仍写 `mode: anyFirst ? "image2video" : ...`，但 2.0 根本不存在 image2video。
   - `AssetDetailDialog.tsx` 还在按 `image2video / text2video` 文案展示。
   - 统一为 `reference2video`（有 ref）/ `text2video`（无 ref）两态。

3. **`image_binding` 的"首尾"语义**
   - `generate-marketing-video-script` 把绑定写成 `{ source: 'unbound' / 'free' / 'expected' }` 还可以保留，但 `MarketingVideo.tsx` 里 `BindingBadge`/`SegmentPreview` 仍输出「开头帧 / 结尾帧 / 首尾帧」字样，要改成「参考图 #N / 自由发挥」。

4. **`SegmentPreview` 文案（MarketingVideo.tsx ~1071-1101）**
   - "固定切成 N 段（30s = 2×15、45s = 3×15）"
   - "每段第一张作开头帧、最后一张作结尾帧"
   - "首尾帧 / 图生视频"
   - 全部按 2.0 改成"参考图驱动 / 一次成片 / 逐镜拼接"的说法。

5. **`videoFailure.ts` 的 1.5 专属分支**
   - `resolution_not_supported`（flf2v + 首尾帧拼接）：2.0 不发首尾帧，这个码不会再触发，删除或退化为通用降分辨率。
   - `ref_and_lastframe_conflict`（last_frame mixed reference）：同上，删除。
   - `stitch_failed` 的修复项「改用 15 秒单段重拍」：2.0 已没有"单段直出"路径，改为「切到一次成片 one_shot」。
   - **Typo 修复**：多处写 `doubao-seedance-2-0-mini-260128`，正确型号是 `-260615`（见 `seedanceModels.ts`）。这是 1.5 → 2.0 迁移时留下的 bug，会让"一键修复 → 切到 Mini"调用 404。

6. **后端 prompt / 注释里的"首帧参考身份板"**
   - `render-marketing-video` buildPrompt 还在说"以首帧参考身份板为准"，2.0 应改为"以参考图身份板为准"。
   - 文件头部 `// hook / scenes[*] / outro 各自成段,独立用自己的静帧作 first_frame` 注释同样过时。

7. **poll / surprise 函数里的过期文案**
   - `poll-marketing-video` 超时提示"建议改用 Seedance Fast 或降到 720p"——OK 保留，但提到 "Pro 720p/1080p 默认" 处的 25 分钟估算是按 1.5 单段算的，2.0 per_shot 多段应按 `segment_total × 单段估算` 重算。
   - `SurpriseVideoDialog` 进度文案"Seedance 起稿中…模型在生成首帧画面"是 1.5 i2v 体感，2.0 reference 模式没有"首帧"概念，改成"模型在排镜头"。

8. **`splitScript` 的最短 4s 兜底**
   - 2.0 最短单段是 3s（官方文档），代码里写 `Math.max(4, …)` 是按 1.5 限制保守抬高。可以放宽到 3s，让短镜头不被强行拉长。

## 实施步骤

1. **`_shared/marketing-segments.ts` & `src/lib/marketingSegments.ts`**
   `pickSegmentImages` 改为只返回 `refIndices`（去掉 firstIndex/lastIndex）。前端 `SegmentPlan` 的 `firstIndex/lastIndex` 字段一并删除，外部消费方同步更新。

2. **`render-marketing-video/index.ts`**
   - `resolveSegmentImages` 移除 first/last 分支，直接遍历 `picks.refIndices`。
   - per_shot 分支 `mode` 仅在 `reference2video / text2video` 之间二选一。
   - `image_usage.per_segment` 去掉 `first / last` 字段。
   - prompt 文案与文件注释中"首帧 / first_frame"改成"参考图"。
   - `splitScript` 最短时长由 `Math.max(4, …)` 改为 `Math.max(3, …)`。

3. **`generate-marketing-video-script/index.ts`**
   `image_binding.source` 收敛为 `ref / free / unbound`，删除任何与 first/last 语义相关的字段。

4. **`src/pages/marketing/MarketingVideo.tsx`**
   - `SegmentPreview` 的标签/说明改成"参考图 #N / 一次成片 / 逐镜拼接"。
   - `BindingBadge` 输出文案同步。
   - 任何 `firstIndex/lastIndex` 的引用删除。

5. **`src/lib/videoFailure.ts`**
   - 删除 `resolution_not_supported` 中的 flf2v 分支判定与 `ref_and_lastframe_conflict` 整段。
   - `stitch_failed` 的"15 秒单段重拍"改为"切到一次成片 (one_shot) 重拍"，patch 写 `{ render_strategy: 'one_shot' }`。
   - 全文搜索 `doubao-seedance-2-0-mini-260128` → 替换为 `-260615`。

6. **`src/components/marketing/AssetDetailDialog.tsx`**
   将 `meta.mode === 'image2video'` 的文案分支删除，只保留 `reference2video / text2video`。

7. **`poll-marketing-video/index.ts`**
   ETA 估算改为按 `segment_total` 乘以单段时间；超时提示文案去掉"单段"措辞。

8. **`SurpriseVideoDialog.tsx`**
   进度提示文案把"生成首帧画面"改成"在排镜头 / 在合成参考图"。

## 验证

- 跑一条「惊喜一下」（one_shot）+ 一条 30s「自定义」（per_shot）两种路径，确认：
  - 数据库 `marketing_assets.meta.mode` 只出现 `reference2video / text2video`。
  - 控制台无 `firstIndex/lastIndex/image2video/first_frame` 任何输出。
- 触发一次"切到 Mini"一键修复，确认请求体里是 `-260615` 不再 404。
- 全文 `rg -n "first_frame|last_frame|image2video|flf2v|260128"` 应只剩 `pro/fast` 的合法 model id。
