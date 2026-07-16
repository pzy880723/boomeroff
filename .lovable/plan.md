## 目标

把“让 BOOMER 替你拍一条”改成：用户点击生成后，只要任务已创建，关弹窗、切页面、退出再回来，都不依赖前端继续轮询；后台会继续推进，完成后自动写入素材库，并保留脚本与发布文案。

## 现状问题

- 当前“帮你拍一条”仍走旧的 `surprise-marketing-video → render-marketing-video → poll-marketing-video` 单段 Seedance 链路。
- 这条链路虽然会创建素材占位，但真正提交/轮询/完成主要靠前端打开弹窗后轮询推进；用户关掉后，任务可能停在排队或运行状态，素材库里就只剩失效/未完成占位。
- 代码里已经有新版 `video_generation_jobs` 导演任务、发布文案、后台合成 Worker 的雏形，但前端“帮你拍一条”没有实际使用它。

## 实施计划

1. **把“帮你拍一条”的确认生成切到新版导演任务**
   - 在 `SurpriseVideoDialog` 里点击“马上生成 15 秒”后调用 `director-create-job`，不再调用旧的 `surprise-marketing-video preview=false`。
   - 本地保存任务为 `kind: 'director'`，用户再打开营销中心时能恢复同一个任务进度。

2. **补齐后台自动推进函数**
   - 新增/调整一个后台推进函数，定期处理 `video_generation_jobs`：
     - 查询 Seedance 镜头状态并回写；
     - 镜头完成后自动触发配音与发布文案；
     - 文案/配音完成后进入合成队列；
     - 如果外部合成 Worker 完成，最终写入素材库。
   - 这样即使用户关掉页面，也不会靠浏览器继续跑。

3. **确保“脚本/文案”跟任务一起保存**
   - 创建任务时把确认过的脚本写入 `video_generation_jobs.script_json`。
   - 发布文案写入 `video_generation_jobs.meta.publish_copy`，最终落到 `marketing_assets.meta.publish_copy`。
   - 素材库详情继续从 `director_job_id → video_generation_jobs.script_json` 回读脚本。

4. **素材库自动可见**
   - 完成回调/后台合成成功后，插入或更新 `marketing_assets`，包含：视频链接、封面、脚本来源、发布文案、标签、`director_job_id`。
   - 营销首页/素材库查询最近视频时能看到最终成片，而不是卡在“脚本失效”。

5. **恢复体验优化**
   - 打开营销中心时，如果本地有未完成导演任务，卡片显示“生成中”。
   - 点进去后展示后台任务状态；如果已经完成，显示“拍好啦/去素材库”。
   - 不再显示误导性的“关掉弹窗也会继续”但实际上靠前端轮询的状态。

## 技术细节

- 前端改动：
  - `src/components/marketing/SurpriseVideoDialog.tsx`
  - 可能微调 `src/lib/surpriseJob.ts` 的任务 TTL/恢复逻辑。

- 后端函数改动：
  - 复用并增强 `director-poll-job` 的状态推进逻辑，或新增后台 sweep 入口。
  - 如需要定时运行，用数据库定时任务调用后台 sweep 函数，避免依赖用户打开页面。
  - 保持所有返回中文，不暴露内部后端名称。

- 不改动范围：
  - 不改变素材挑选/脚本预览逻辑。
  - 不改变你刚要求的广告文案风格方向：可以出现中信泰富等文案信息，营业时间写 10:00–22:00，标题更网红更抓人。