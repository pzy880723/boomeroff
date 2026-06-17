## 现状

`render-marketing-video` 只往 `marketing_video_jobs` 写一行 `queued`,没有真实渲染 worker,所以所有视频永远卡在排队。现在改成调用火山方舟 Seedance API 完成真实生成。

## 对接方式

Seedance 是**异步任务制**:`POST /tasks` 创建 → 返回 task id → `GET /tasks/{id}` 轮询 → `succeeded` 时拿到 `video_url`。我们把这两步包成两个 edge function,前端轮询渲染卡片状态即可,不需要后台 cron。

## 你需要先做的事(平台侧)

截图里的 404 `ModelNotOpen` 说明账号还没开通模型。先到火山方舟控制台 → 开通管理 → 把要用的模型开通(建议 `doubao-seedance-1-5-pro-251215`,2.0 系列要等 6/22 才能 API 调用,且不支持 seed/camera_fixed/参考图场景多,先用 1.5 Pro 更稳)。同时确保账户余额 > 200 元或买了资源包。

## 计划

### 1. 存 API Key
新增 secret `ARK_API_KEY`(也就是截图里那个 c6c1...的 key)。完成开通后我会通过 add_secret 工具让你填。

### 2. 改造 `render-marketing-video`
不再只是入队,而是真正调用火山 API:

- 把 6 段分镜的文案合并成一个总 prompt(Seedance 单次任务生成 1 个视频,不能多镜头拼接 — 多镜头要靠 prompt 里的镜头切换描述,或者多次任务后用 ffmpeg 拼,这是后续优化点,先做单段)
- 取第一张参考图作为首帧(`role: first_frame`),其余图片忽略(1.5 Pro 不支持多参考图)
- `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`,Header `Authorization: Bearer $ARK_API_KEY`
- Body:
  ```json
  {
    "model": "doubao-seedance-1-5-pro-251215",
    "content": [
      { "type": "text", "text": "<合成 prompt>" },
      { "type": "image_url", "image_url": { "url": "<首帧 URL>" }, "role": "first_frame" }
    ],
    "resolution": "720p",
    "ratio": "9:16",   // 跟 script.aspect 一致
    "duration": 5,     // 1.5 Pro 最短 4s,最长 12s;我们的 15/20/30 截到 12
    "watermark": false,
    "generate_audio": true
  }
  ```
- 把返回的 `id` 存到 `marketing_video_jobs.provider_task_id`,`marketing_assets.meta.task_id`,状态保持 `queued`

### 3. 新增 `poll-marketing-video` edge function
入参 `{ job_id }`,做:
- 读 `marketing_video_jobs` 拿到 `provider_task_id`
- `GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`
- 根据 `status` 更新 `marketing_video_jobs.status` 和 `marketing_assets`:
  - `succeeded` → 写入 `output_url = video_url`,`meta.status = succeeded`
  - `failed` / `expired` → 写错误信息
  - 其它 → 保持 running/queued
- 返回当前状态给前端

### 4. 数据库 migration
给 `marketing_video_jobs` 加列:
```sql
ALTER TABLE public.marketing_video_jobs
  ADD COLUMN IF NOT EXISTS provider_task_id text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'volcengine_seedance',
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS video_url text;
CREATE INDEX IF NOT EXISTS idx_mvj_provider_task ON public.marketing_video_jobs(provider_task_id);
```

### 5. 前端 `MarketingLibrary.tsx`
对 status 不是 `succeeded`/`failed` 的视频卡片,每 10s 调一次 `poll-marketing-video`,直到终态;卡片显示 `排队中 → 渲染中 → 已完成 / 失败`。点开 succeeded 的卡片直接播放 `output_url`。

### 6. 老的 7 条 `queued` 历史
做 migration 一并把现存 `status='queued'` 且 `provider_task_id IS NULL` 的全部标为 `failed`,error='旧版本未真实渲染',素材库里允许删除。

## 不在本次范围

- 多分镜拼接(后续可加 ffmpeg worker 或换 Seedance 2.0 多模态参考)
- callback_url 回调(目前先用前端轮询,简单;后续可换成 Supabase webhook)
- 文生视频/首尾帧/参考音频(都先按"首帧+文本"最常用模式,后续可扩)
- 风格 chips(上次提的 8 种风格)合并到 prompt 里——保持上次方案,不在本次重新设计

## 技术细节

| 项 | 取值 |
|---|---|
| Endpoint | `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks` |
| 鉴权 | `Authorization: Bearer $ARK_API_KEY` |
| 默认模型 | `doubao-seedance-1-5-pro-251215` (admin 可在 MarketingPresetsPanel 里覆盖) |
| 默认分辨率 | 720p |
| 默认时长 | 用户选 15/20/30 → clamp 到 [4,12] |
| 轮询周期 | 前端 10s 一次,最长 8 分钟超时 |

确认这个方案吗?确认后我会:(1) 申请 ARK_API_KEY secret,(2) 写 migration,(3) 改 `render-marketing-video`,(4) 新建 `poll-marketing-video`,(5) 改 MarketingLibrary 卡片。
