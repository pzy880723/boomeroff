# Director Compose Worker Contract

This contract describes the server-side post-production stage for BOOMER.OFF
Director videos. Lovable / Supabase owns planning, shot generation, voiceover,
publish copy, and the claim/callback endpoints. The Tencent Cloud Worker owns
final video assembly.

## Goal

Produce a publish-ready vertical video from a Director job:

```text
Seedance shot videos
+ TTS voiceover
+ subtitle timeline
+ optional BGM / logo / cover
=> final mp4
=> marketing_assets video row
```

The Worker must not claim a job until `director-poll-job` has confirmed both:

- `video_generation_jobs.meta.voiceover.generated_at`
- `video_generation_jobs.meta.publish_copy.generated_at`

This prevents the Worker from composing a silent clip without subtitles or
publish copy.

## Claim

```http
POST /functions/v1/compose-claim-next
X-Worker-Token: ${COMPOSE_WORKER_TOKEN}
Content-Type: application/json

{ "worker_id": "tencent-compose-01" }
```

Expected response:

```json
{
  "ok": true,
  "job": {
    "id": "uuid",
    "user_id": "uuid",
    "shop_id": "uuid",
    "duration": 15,
    "aspect_ratio": "9:16",
    "character": {},
    "script": {},
    "user_prompt": "帮上海门店拍一条周末探店视频",
    "publish_copy": {
      "caption": "...",
      "douyin_caption": "...",
      "hashtags": ["#BOOMEROFF"],
      "cover_title": "...",
      "cover_subtitle": "..."
    },
    "subtitles": [
      { "shot_index": 0, "text": "...", "start_s": 0, "end_s": 3.2 }
    ],
    "voiceover": {
      "model": "openai/gpt-4o-mini-tts",
      "voice": "alloy",
      "total_duration_s": 14.8,
      "generated_at": "ISO"
    }
  },
  "shots": [
    {
      "shot_index": 0,
      "duration": 5,
      "video_url": "https://...",
      "subtitle": "...",
      "dialogue": "...",
      "voiceover_url": "https://...",
      "voiceover_duration_s": 3.2
    }
  ],
  "claim": {
    "worker_id": "tencent-compose-01",
    "callback_url": "https://.../functions/v1/compose-callback",
    "heartbeat_url": "https://.../functions/v1/compose-heartbeat"
  }
}
```

## Heartbeat

Send every 30-60 seconds while composing.

```http
POST /functions/v1/compose-heartbeat
X-Worker-Token: ${COMPOSE_WORKER_TOKEN}
Content-Type: application/json

{
  "job_id": "uuid",
  "worker_id": "tencent-compose-01",
  "progress": {
    "percent": 45,
    "stage": "mixing_audio",
    "message": "正在混合配音和 BGM"
  }
}
```

## Callback

Success:

```http
POST /functions/v1/compose-callback
X-Worker-Token: ${COMPOSE_WORKER_TOKEN}
Content-Type: application/json

{
  "job_id": "uuid",
  "final_video_url": "https://...",
  "cover_url": "https://...",
  "duration_seconds": 15
}
```

Failure:

```json
{
  "job_id": "uuid",
  "error": "ffmpeg subtitle burn failed: ..."
}
```

## Worker Responsibilities

The Worker should:

1. Download all `shots[].video_url` in `shot_index` order.
2. Download available `shots[].voiceover_url`.
3. Normalize every clip to the target aspect ratio and frame rate.
4. Concatenate shot videos in order.
5. Mix voiceover audio; if voiceover is missing, continue with source audio or silence.
6. Burn subtitles from `job.subtitles`.
7. Add optional BGM and brand logo when configured.
8. Export one final mp4.
9. Upload the mp4 to the configured storage provider.
10. Call `compose-callback`.

## Acceptance Criteria

- A job in `compose_status='queued'` becomes `claimed`, then `running`, then `done`.
- The final asset appears in `marketing_assets(kind='video')`.
- `marketing_assets.meta.publish_copy` includes caption, hashtags, and cover title.
- `video_generation_jobs.final_video_url` is playable.
- A failed Worker job writes `compose_status='failed'` and `error_message`.

