
# 营销中心 AIGC 升级方案

目前 Director Pipeline 主链路已跑通（create-job → run-pipeline → poll-job → retry-shot → complete-job，shots 有完整字段、局部重试、进度七步）。这轮按文档补齐剩下的三块，让"一句话生成 15 秒视频"更贴近小云雀那种可交付水平。

## A. TTS 配音 + 字幕时间轴

- 新增 edge function `director-generate-voiceover`
  - 输入：`job_id`
  - 读取 `video_generation_shots.subtitle`（没有就退回 `dialogue`），逐 shot 调 Lovable AI TTS `openai/gpt-4o-mini-tts`（`response_format: mp3`，非流式，一次拿完整音频），上传到 storage bucket `video-assets/voiceover/{job_id}/{shot_index}.mp3`
  - 写回 `shots.meta.voiceover_url` + `shots.meta.voiceover_duration_s`
  - 汇总生成字幕时间轴 `subtitles: [{shot_index, text, start_s, end_s}]`，写到 `video_generation_jobs.meta.subtitles` 和 `meta.voiceover`
- `director-run-pipeline` 在所有 shot `succeeded` 之后、`status='composing'` 之前调用它；期间 job.status = `generating_voice`（新增字符串状态，无需改 enum）
- 密钥：使用现有 `LOVABLE_API_KEY`（用户回复"已经在密钥里"指的是 TTS 走 Lovable Gateway，无需再要）
- 语音选择：从 `character_json.voice` 或 job.meta.persona.pace 推导 voice（默认 `alloy`）
- 失败降级：TTS 失败不阻塞整体，仅标记 `job.meta.voiceover.error`；字幕时间轴退回按字数估算

## B. 自动生成发布文案 / hashtag / 封面标题

- 新增 edge function `director-generate-publish-copy`
  - 输入：`job_id`
  - 读 `job.script_json` + `job.user_prompt` + 门店/品牌信息（shop 名、city、tags）
  - 调 Lovable AI `google/gemini-2.5-flash`，结构化输出：
    ```json
    {
      "caption": "小红书风格 100-140 字",
      "douyin_caption": "抖音风格 60 字内",
      "hashtags": ["#..."],
      "cover_title": "封面大字 6-10 字",
      "cover_subtitle": "副标题 12 字内"
    }
    ```
  - 写到 `video_generation_jobs.meta.publish_copy`
- `director-complete-job` 落 `marketing_assets` 时，把 `caption/hashtags/cover_title` 写进 `marketing_assets.meta.publish_copy`，供后续小红书/抖音发布任务直接取用
- 前端 `DirectorProgress` 完成态展示"文案已生成，一键复制/去发布"卡片

## C. 外部 Worker 合成接口

用于把 FFmpeg 拼接、字幕烧录、TTS 混音、BGM、Logo 合成交给腾讯云 Worker，Lovable 只做编排。

- DB
  - `video_generation_jobs` 新增 `compose_status text default 'idle'`（idle / queued / claimed / running / done / failed）、`compose_worker_id text`、`compose_claimed_at timestamptz`、`compose_heartbeat_at timestamptz`
  - Pipeline 走完 TTS 后：`status='composing'`, `compose_status='queued'`
- 新增三个 edge function（`verify_jwt=false`，用 header `X-Worker-Token` 校验，密钥 `COMPOSE_WORKER_TOKEN` 走 `generate_secret`）
  1. `compose-claim-next`：Worker 轮询拉一个 `compose_status='queued'` 的 job，原子更新为 `claimed`，返回 job + shots + voiceover_urls + subtitles + character
  2. `compose-heartbeat`：更新 `compose_heartbeat_at`，防止僵死
  3. `compose-callback`：Worker 上传完 mp4 后回写 `final_video_url / cover_url / duration_seconds`，标记 `compose_status='done'`，触发 `director-complete-job` 入素材库
- 超时补偿：`compose-claim-next` 会把 heartbeat > 5min 的 claimed 任务回退到 queued
- 兼容现有 MVP：`app_settings.compose_mode = 'client' | 'worker'`（默认 `client` 走现在客户端 FFmpeg 拼片；管理员在 `/portal` 切换到 `worker` 时才走上面新链路）

## 前端改动

- `DirectorProgress.tsx` 七步展示新增两步：`generating_voice`、`composing`（Worker 模式时展示 heartbeat 时间）
- `VideoJobDetailPanel` 完成态新增：可复制的 caption / hashtags / cover_title
- `/portal` "AI 视频" tab 加合成模式开关

## 技术细节

- 状态字符串（不动 enum，用 text）：
  `queued → planning → storyboarding → character_created → generating_shots → retrying_shots → generating_voice → composing → uploading → completed / failed`
- 密钥新增：`COMPOSE_WORKER_TOKEN`（generate_secret，用于给 Codex 那边配到 Worker env）
- 密钥沿用：`LOVABLE_API_KEY`（TTS + 文案）
- Storage bucket：如果 `video-assets` 不存在则建，`voiceover/{job_id}/*.mp3` public
- 施工顺序（同一轮内完成）：
  1. migration：加 compose_* 字段、meta.subtitles/voiceover/publish_copy 由 JSON 无需 schema
  2. 生成 COMPOSE_WORKER_TOKEN
  3. 3 个新 edge function：generate-voiceover / generate-publish-copy / compose-*
  4. `director-run-pipeline` 串起 voiceover + publish-copy + compose 分支
  5. `director-complete-job` 消费 publish_copy 写入 marketing_assets
  6. 前端 DirectorProgress + /portal 开关

## 交付后你要做的事

- 把 `COMPOSE_WORKER_TOKEN` 和 compose-claim-next / compose-callback 的 URL 交给 Codex，那边照文档实现 Worker
- 在 `/portal` 把合成模式切到 `worker` 才会真正走外部合成，切换前一切按现在的客户端 MVP 跑
