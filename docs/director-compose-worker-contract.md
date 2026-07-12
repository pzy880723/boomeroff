# Director Compose Worker Contract

## Job 状态机(严格顺序)

```
queued → character → shooting
       → generating_voice   (所有 Seedance 镜头 succeeded 后进入)
       → ready_to_stitch    (voiceover.generated_at && publish_copy.generated_at)
       → composing          (worker 领取:compose_status=queued → running)
       → done               (Worker 回调 compose-callback 上传成片)
       → failed             (镜头失败 / Worker 报错)
```

## 关键不变式

Worker **禁止**领取 `compose_status != 'queued'` 的任务。
`compose_status` 只有满足以下**全部**条件才允许由 `idle → queued`:

1. `video_generation_jobs.status = 'ready_to_stitch'`
2. `meta.voiceover.generated_at` 非空
3. `meta.publish_copy.generated_at` 非空
4. `app_settings.compose_mode = 'worker'`

由 `director-poll-job` 唯一入口写入,使用 `.eq("compose_status","idle")` 乐观锁。

## meta 字段约定

```json
{
  "voiceover":     { "generated_at": "ISO", "audio_url": "...", "duration": 15.2, "model": "..." },
  "publish_copy":  { "generated_at": "ISO", "caption": "...", "hashtags": [...], "cover_title": "...", "cover_subtitle": "..." },
  "__inflight":    { "voice_at": 1700000000000, "copy_at": 1700000000000 }
}
```

`__inflight` 由 poll-job 维护,90s 内不重复触发同一子任务。

## Worker 端接口

- `POST /functions/v1/compose-claim-next` (Header `X-Worker-Token`) — 领取一条 `compose_status='queued'` 的任务,原子 CAS 为 `running`。
- `POST /functions/v1/compose-heartbeat` — 更新 `compose_heartbeat_at`。
- `POST /functions/v1/compose-callback` — 上传成片后回调,写 `final_video_url` / `cover_url` / `status='done'`。

任何时候 Worker 拿到的 `job.meta.voiceover.audio_url` 与 `job.meta.publish_copy.caption` 都保证非空。
