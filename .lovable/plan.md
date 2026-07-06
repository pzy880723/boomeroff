
## 1. 视频详情下方加「查看脚本」折叠区

**文件**：`src/components/marketing/AssetDetailDialog.tsx`（仅 video kind 分支）

- 打开 dialog 时若 `asset.kind === 'video'` 且有 `asset.meta?.job_id`，异步拉取 `marketing_video_jobs.script`（沿用 `regenerateVideo` 里已有的查询方式），存到本地 `videoScript` state。
- 在视频播放器下方、文案区上方，新增一个可折叠面板：
  - 标题栏：「📝 查看脚本 · 共 N 镜 · 总 Xs」，点击展开/收起（默认收起）。
  - 展开后依次列出：`钩子 / 镜01…镜NN / 收尾`，每条显示 `duration_s · dialogue · subtitle · scene`（复用 `MarketingVideo.tsx` 里 `gatherScriptClips` 的字段命名），只读展示，可整段复制。
  - 脚本缺失时提示「脚本已过期或未保存」。

## 2. 去掉 4 种爆文风格，改为单条小红书文案

**同一文件**：删除 `ViralStyle` 4 选 1 UI 与 fallback 分支。

- 移除：`挑一种爆文风格` 网格、`换个风格再来一版` 分组、`generateVideoCopy(style)` 的 style 参数与 `buildXhsViral` fallback、`videoCopy.style` 字段展示。
- 新按钮：视频渲染成功后自动检查 `asset.meta?.video_copy`，若无就调 **新 edge function** `generate-marketing-video-copy` 生成一条；已有则展示 + 一个「🔄 重新生成文案」按钮。
- `videoCopy` 结构保留 `{ title, body, hashtags, first_comment }`（去掉 style 字段），保存回 `asset.meta.video_copy`。
- 首屏 badge 从「小红书爆文 · XX」改为「小红书文案」。

## 3. 新增 edge function `generate-marketing-video-copy`

**新文件**：`supabase/functions/generate-marketing-video-copy/index.ts`

- 入参：`{ asset_id, shop_id? }`。
- 从 `marketing_assets` 读 asset → 从 `marketing_video_jobs` 读 script（含 hook / scenes / outro 的 dialogue+subtitle+scene）。
- 用 script 全文 + shop context + KB 命中拼 prompt，让 AI 生成**单条**小红书文案（title/body/hashtags/first_comment），要求：正文围绕视频里真的讲了什么，不再要求 emoji 爆炸风。
- 写回 `marketing_assets.meta.video_copy`。
- 复用 `_shared/shop-context.ts` / `_shared/kb.ts` / `_shared/brand-scrub.ts` 的清洗逻辑。

生成失败时前端 toast 明确报错，不再本地兜底套模板。

## 4. 15 秒脚本必须完整讲完 · 收紧节奏

**文件**：`supabase/functions/generate-marketing-video-script/index.ts`

痛点：现在 15s 允许最多 7 段 × 5s、dialogue 每段 ≤16 字，AI 常常写超 → Seedance 念不完，或者钩子/CTA 被截掉。

修改：

- **重排 clip 数**：`duration <= 15` 时固定 hook + 3 scenes + outro（共 5 clip），每 clip `duration_s = 3s`，`perClipMax = 3`。让每段实际时长贴近 Seedance 的 10s+5s 网格拼接后的真实节奏。
- **口播字数硬预算**：新增变量 `totalSpeakBudgetCn = Math.floor(duration * 4)`（15s→60 字），并在 system prompt 里显式：
  - `hook.dialogue ≤ 8 字（必须是完整钩子）`
  - `outro.dialogue ≤ 8 字（必须是完整 CTA）`
  - `中段每 scene.dialogue ≤ 14 字`
  - `全片 dialogue 汉字合计 ≤ ${totalSpeakBudgetCn}`
  - 「宁可少说也不许写半句 / 不许省略 CTA」
- **服务端强制截断**：在 sanitizeScene 之后加一段兜底：
  - 若 `hook.dialogue` 或 `outro.dialogue` 为空 → 用一句短兜底（"进来看看 ✨" / "感兴趣速冲"）填上。
  - 汇总所有 dialogue 汉字数，若 > totalSpeakBudgetCn：按比例截断**中段** scene 的 dialogue（保留 hook / outro 完整），从最长的一段先截；截断后确保结尾是句号/感叹号，避免半句。
- **duration 归一**：所有 clip `duration_s` 直接写死 3s，跳过原有的 ±20% 缩放逻辑（避免 AI 写 5s 又被硬拉）。
- **说话速率提示**：把原 prompt 里的「5 字/秒激动口播」改为「4 字/秒清晰口播（15 秒总共只有 60 字可念）」。

`duration = 20` / `30` 走原有 targetClips 公式不变，只有 15s 这条严格路径生效。

## 技术说明

- `marketing_video_jobs.script` 已经在 DB 保留完整字段（`hook/scenes/outro/dialogue/subtitle`），前端只需 select 一次。
- 新 edge function 走 `verify_jwt = false` 默认，自行校验 `Authorization`（照现有 `generate-marketing-copy` 结构 copy）。
- `AssetDetailDialog.tsx` 里 `VIRAL_STYLE_LABELS / buildXhsViral / ViralStyle` 的 import 移除，但 `src/lib/shareCopy.ts` 保留（其他调用方仍在用）。
- 不动 DB、不动 render-marketing-video、不动 storyboard 相关代码。

## ASCII 结构

```text
AssetDetailDialog (video)
  ├── 标题 / meta
  ├── 立意
  ├── 视频播放器
  ├── ▶ 查看脚本 (可折叠, 默认收起)  ← 新增
  │     └── hook / scene01..N / outro
  ├── 小红书文案 (自动生成, 单条)     ← 简化
  │     └── [🔄 重新生成文案]
  ├── 复制链接 / 下载
  ├── ✈️ 一键发布
  └── 用同样脚本重新生成一条
```
