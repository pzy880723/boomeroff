## 目标

保留现在「惊喜一下」的整体交互：**用户点一下 → 系统自动选图 + 生成角色 + 写脚本 → 展示预览 → 用户点「确认生成」→ 后台自动出一条 15s 竖版视频**。不做一句话输入框，不改入口位置。只把「确认之后」那一段渲染，从原来的「一句话丢 Seedance」升级成完整流水线，并给用户看清楚每一步进度。

## 交互分两段（保持现状 + 增强）

### A 段：预览（复用现有 SurpriseSheet，几乎不动）
- `pick-surprise-material` → 自动挑素材
- `generate-marketing-video-script` → 出脚本 + `one_shot_prompt`
- SurpriseSheet 上现在就有：封面图、脚本片段、「换一个」「确认生成」两个按钮

改动：**不删旧的一句话直出路径**，但在「确认生成」按钮点下去之后，走新流水线（下面 B 段），并把当前 sheet 从「等一个视频 URL」升级成「7 步进度面板」。

### B 段：确认后 → 导演流水线（新做）

用户在 SurpriseSheet 点「确认生成」，前端调新 `director-create-job`，把 A 段已经产出的 `pick + script + character` 直接透传过去，跳到 sheet 内的「拍摄中」视图。UI 展示：

```text
● 理解需求          ✓
● 生成脚本          ✓（复用 A 段结果）
● 创建角色参考图    ●
○ 拆分镜首帧 2/4
○ 逐镜生成 0/4
○ 合成字幕与配音
○ 保存成片
```

每步 `pending / running / success / failed`。失败：显示是哪个镜头挂了，按钮 `重试该镜头` / `重新生成整条`。成片出来后 sheet 内直接播放 + 「保存到素材库」「一键发布」「编辑文案」按钮。

## 前端改动

- `src/components/marketing/SurpriseSheet.tsx`
  - 「确认生成」原本调 `surprise-marketing-video`，改成调新 `src/api/videoGeneration.ts → createVideoJob({ pick, script })`。
  - 新增 `<DirectorProgress jobId={...} />` 视图（进度 + 分镜卡 + 成片播放）替换原本的等待占位。
- `src/api/videoGeneration.ts`（新）
  - `createVideoJob(payload)` / `getVideoJob(jobId)` / `retryShot(jobId, idx)` / `regenerateJob(jobId)` / `saveToAssetLibrary(jobId)` / `publishGeneratedVideo(jobId)`
- 新组件：
  - `components/marketing/director/PipelineTracker.tsx`
  - `components/marketing/director/ShotGrid.tsx`（每镜 = 首帧缩略图 + 15s 短片 + 状态 + 重试）
  - `components/marketing/director/FinalPreview.tsx`
  - `hooks/useDirectorJob.ts`（2s 轮询直到 done/failed）
- `MyMarketing.tsx` **不动**，入口保持原样。

## 后端改动

### 迁移：两张新表
```sql
video_generation_jobs (
  user_id, shop_id, source_pick_json, brief_json, script_json,
  character_json, status, duration=15, aspect_ratio='9:16',
  final_video_url, cover_url, error_message, meta
)
video_generation_shots (
  job_id, shot_index, duration, scene, subject, action, camera,
  subtitle, dialogue, prompt, reference_image_url, first_frame_url,
  seedance_task_id, video_url, status, retry_count, error_message
)
```
按 `<public-schema-grants>` 走 GRANT + RLS：用户只能读写自己的 job/shots，`service_role` 全通。

### 新 edge functions（`supabase/functions/`）
1. **`director-create-job`**：入参 = 前端透传的 pick + 已生成 script + shopId。落 job 行，异步触发 `director-run-pipeline`，返回 `jobId`。
2. **`director-run-pipeline`**（主控，串行 7 步）：
   - step1 理解需求：把 A 段 pick/script 归一化写进 `brief_json`（15s / 9:16 / 复古生活方式默认值）。
   - step2 生成脚本：**复用 A 段 `script_json`**，不重跑。
   - step3 拆分镜：用 `google/gemini-3.5-flash` 结构化输出 3–5 镜 × 3–5s，每镜含 `scene/subject/action/camera/subtitle/dialogue/seedance_prompt`。写入 shots 表。
   - step4 创建角色：
     - 用同模型出 `character_card`（性别/年龄感/发型/服装/气质 + 「原创虚构、非明星非网红」禁词）。
     - 用 `google/gemini-3.1-flash-image`（Nano Banana 2）出 1 张 9:16 角色参考图 → 上传 `marketing-assets` bucket。写 `character_json`。
   - step5 生成镜头（并发 ≤ 2）：
     - 每镜先用 Nano Banana `edit_image`：`[角色参考图]` + prompt「同一人物 · 场景=... · 动作=...」→ 出 `first_frame_url`（锁人 + 锁场）。
     - 走已有 `_shared/seedance-submit.ts`，`referenceImages = [角色参考图, first_frame_url]`，`facePipeline='character_sheet'`，duration 就近 5s。写回 `seedance_task_id`。
     - 复用现有轮询模式（新 `director-poll-shots`），拉回 `video_url`，简单质检（有 URL + 时长 ≥ 目标-1s），失败只重试当前镜头。
   - step6 合成：`director-compose`
     - `openai/gpt-4o-mini-tts` 逐镜出中文旁白 mp3 → 上传。
     - 服务端 ffmpeg（在 edge function 里用 `npm:fluent-ffmpeg` 不可行 → 落地方案：**新建一个 Deno edge function `director-compose` 中调用 `https://deno.land/x/ffmpeg` wasm 版本**，做 concat + 音轨 mix + 字幕烧录）。字幕来源 = `script.subtitle` + TTS 时间轴。
     - BGM 从 `marketing-assets/bgm/` 随机低音量混音。
     - 输出 mp4 + 封面首帧 → 写 `final_video_url` / `cover_url`。
   - step7 保存：insert `marketing_assets`（`type=video`，`meta.director_job_id`）。`status='done'`。
3. **`director-retry-shot`**：重置指定 shot → 重跑 step5 单镜；如所有 shot 都 done，接着 step6。
4. **`director-regenerate`**：清空 shots + final_video_url，从 step3 重跑。
5. **`director-publish`**：包 `dispatch-*` 现有分发流程。

所有 function `verify_jwt=true`，用 admin client 写库、authClient 校验 uid。

### 关键约束
- Seedance 全部走 reference2video，同一张角色参考图 + 每镜首帧共两张 refs（≤ `SEEDANCE_MAX_REFS`）。
- 不做纯 text2video；这条硬约束贯穿 step5。
- 每步错误单独写 `error_message`，不隐藏。
- 老的 `surprise-marketing-video` / `render-marketing-video` **不删不动**，避免波及其他入口。

## 交付顺序

1. Migration（两张表 + GRANT + RLS）。
2. edge functions：`director-create-job` / `director-run-pipeline` / `director-poll-shots` / `director-compose` / `director-retry-shot` / `director-regenerate` / `director-publish`。
3. `src/api/videoGeneration.ts` + `useDirectorJob`。
4. `SurpriseSheet` 内嵌 `DirectorProgress`（3 个子组件）。
5. 保留旧路径做兜底：若新 `createVideoJob` 报错，前端 fallback 回老 `surprise-marketing-video`（一次性防护，不做长期兼容）。

## 明确不做

- 不做一句话输入框、不做独立新页面、不动 `MyMarketing` 入口。
- 不改脚本 JSON 老契约。
- 不改 20s / 30s 以上路径。
- 不删 `SurpriseSheet` / `surpriseJob` / 旧 edge function。
