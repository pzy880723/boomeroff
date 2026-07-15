# Director 多镜头流水线发布修复

## 线上故障

当前生产项目 `narqwgwpqglathwtyevz` 的函数状态：

- `director-create-job`: 404，未部署
- `director-run-pipeline`: 404，未部署
- `director-retry-shot`: 404，未部署
- `director-poll-job`: 已部署
- `director-generate-voiceover`: 已部署
- `director-generate-publish-copy`: 已部署
- `director-complete-job`: 已部署
- `compose-claim-next / heartbeat / callback`: 已部署

前端调用 `director-create-job` 失败后，旧代码会退回 `surprise-marketing-video`，所以用户最终拿到的是单次 15 秒视频，而不是按脚本逐镜生成的视频。

## 必须发布的代码

请先拉取 GitHub 最新 `main`，然后把下面三个 Edge Function 及其 `_shared` 依赖部署到内嵌 Supabase 项目：

```text
supabase/functions/director-create-job
supabase/functions/director-run-pipeline
supabase/functions/director-retry-shot
supabase/functions/_shared/director-utils.ts
supabase/functions/_shared/seedance-submit.ts
supabase/functions/_shared/seedance-models.ts
supabase/functions/_shared/face-gateway.ts
```

保持 JWT 校验开启。不要修改现有 secrets；函数继续使用已有：

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
LOVABLE_API_KEY
ARK_API_KEY
```

## 正确行为

1. `director-create-job` 把 15 秒脚本编译为 3 个连续的 5 秒独立镜头。
2. 5 段脚本节拍会按顺序无损归并为 3 镜，不能使用 `one_shot_prompt`。
3. `director-run-pipeline` 先生成唯一角色参考图，再逐镜调用 3 次 Seedance。
4. 每镜都带同一个角色参考图和该镜对应的真实场景素材。
5. 角色参考图生成失败时整条任务失败，禁止无角色参考继续生成。
6. 三镜全部成功后才进入 TTS、字幕、发布文案和腾讯云 compose Worker。
7. 任何 Director 服务错误都直接显示错误，禁止退回旧的一次 15 秒成片模式。

## 发布后验收

无登录探测应该从 404 变成 401：

```text
POST /functions/v1/director-create-job -> 401 JSON
POST /functions/v1/director-run-pipeline -> 401 JSON
POST /functions/v1/director-retry-shot -> 401 JSON
```

随后登录 App 发起一次“让 BOOMER 替你拍一条”，确认：

```text
video_generation_jobs.meta.pipeline_version = director-v2
video_generation_jobs.meta.planned_shot_count = 3
video_generation_shots count = 3
每条 duration = 5
三个 seedance_task_id 均不相同
最终 compose Worker 收到 3 条 shots
```
