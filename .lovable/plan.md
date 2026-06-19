
## 目标

`时长` 选 20s / 30s 时,后端自动把脚本切成多段(每段 ≤10s,Seedance 单任务上限),分别调用 AI 生成,全部完成后由服务器**自动拼接**成一支完整 MP4,最终在素材库里只看到一条视频,体验和现在一致。

## 用户感知

- 选 30s → 提示「将分 3 段生成并自动拼接,约需 3-6 分钟」。
- 素材库里那条视频卡片显示进度:`生成中 1/3 → 2/3 → 3/3 → 拼接中 → 完成`。
- 完成后播放是一支无缝 30s 视频,无水印、保持同一画幅。

## 实现方案

### 1. 切分脚本(`render-marketing-video`)

- 若 `total_duration_s > 12`:按场景累加时长贪心打包,生成 N 个子脚本(`hook` 进第一段,`outro` 进最后一段,中间镜头按 ≤10s 容量装箱)。
- 每个子脚本单独调 Seedance,拿到 N 个 `provider_task_id`。
- `marketing_video_jobs` 新增字段:`parent_job_id uuid`、`segment_index int`、`segment_total int`、`segment_url text`。父 job 状态用于汇总,子 job 各自轮询。
- 父 job 在 `marketing_assets` 里只插一条(占位 `output_url=null`),子 job 不进素材库。

### 2. 轮询(`poll-marketing-video`)

- 子 job 完成时,把 `segment_url` 写到子 job 行,同时检查同一 `parent_job_id` 下是否全部成功。
- 全部成功 → 把父 job 置为 `stitching`,异步触发新函数 `stitch-marketing-video`。
- 任一子 job 失败 → 父 job 标记 `failed`,前端展示错误并允许重试该段。

### 3. 拼接(新函数 `stitch-marketing-video`)

- 用 [Mediabunny](https://mediabunny.dev)(纯 TS,Deno 原生可跑,无需 ffmpeg 二进制)依顺序读取 N 个段的 MP4 → demux → 用同一 muxer 重新封装成一支 MP4(同分辨率/码率/帧率,Seedance 输出参数一致,无需重编码,秒级完成)。
- 上传到 `marketing-videos` 存储桶,写回父 job `output_url` + `marketing_assets.output_url`,父 job 置 `succeeded`。
- 失败回退:若 demux 参数不一致,降级为 ffmpeg-wasm 重编码(更慢,但兜底)。

### 4. 前端 (`MarketingVideo.tsx` + `MarketingLibrary.tsx`)

- 时长选 20/30 时显示一行小字:「将分 N 段生成并自动拼接」。
- 素材库视频卡片读取父 job 的 `meta.segment_total / segment_done / stage`,渲染进度文本(生成 x/N · 拼接中 · 已完成)。
- 现有 15s 走老路径(单段),零改动影响。

### 5. 数据库迁移

```sql
ALTER TABLE marketing_video_jobs
  ADD COLUMN parent_job_id uuid REFERENCES marketing_video_jobs(id) ON DELETE CASCADE,
  ADD COLUMN segment_index int,
  ADD COLUMN segment_total int,
  ADD COLUMN segment_url text;
CREATE INDEX ON marketing_video_jobs(parent_job_id);
```
RLS 沿用现有策略(子 job 与父 job 同 `user_id`)。

## 风险与备选

- **Mediabunny 在 Deno 的 MP4 remux 兼容性**:Seedance 输出是标准 H.264 + AAC MP4,实测可直接 concat;若个别段参数漂移,自动走重编码兜底。
- 若你更倾向于「让我手动下载分段自己拼」,可以把第 3 步去掉,改为素材库展示 N 个分段视频。请告诉我用哪种。

## 需要你确认

是否按上面「**自动拼接成一支**」的方案做?还是希望「**分段呈现,不自动拼接**」?
