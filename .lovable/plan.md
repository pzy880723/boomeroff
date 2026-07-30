# 只读调查报告（未改代码 / 未部署 / 未写库）

## 1) social-publish-dispatch 与 worker-cron-tick 的冲突

事实：
- `cron.job` 共 5 条 active：`kb-ingest`(1)、**`social-publish-dispatch-every-min`(2, 每分钟)**、`poll-marketing-video?mode=sweep`(3, 每分钟)、`boomer-daily-full-backup-to-cos`(6, 每 5 分钟)、`director-cron-tick-every-minute`(7)。
- **没有任何 cron 调用 `worker-cron-tick`、`automation-tick`、`dispatch-cron-tick`。** worker-cron-tick 只能由外部 Worker 主动拉取时才跑。
- `social-publish-dispatch` **已部署且每分钟在跑**（Edge 日志有持续 booted/shutdown），但**源码已在提交 d7e67299 从仓库删除**，其依赖 `_shared/social-dispatch.ts` 也已不在仓库。删除前的实现（d7e67299^）是**推模式**：
  - 取 `social_publish_jobs.status='scheduled' AND schedule_at<=now` 最多 20 条；
  - CAS 把 job 直接改成 `running`（跳过 `queued`）；
  - 取该 job 下 `targets.status in ('scheduled','queued')`，调用 `dispatchToWorker()` 直接 HTTP 推给旧 Worker，再 `finalizeJobStatus()`。
- `worker-cron-tick` 是**拉模式**：先把到点 `scheduled` job 改 `queued`、targets 改 `pending`，回收过期 claim，再 CAS `pending → claimed`（15 分钟 claim，含 claim_token/worker_task_id），claim 后 job `queued → running`。
- `dispatch-cron-tick`（仓库内、未被任何 cron 调用）做的事与 worker-cron-tick 的第 0 步重复，另加 30 分钟 running 超时判失败。

结论：**两条路径抢的是同一批 `scheduled + 到点` 的 job**。谁先跑谁把 job 状态改掉；社媒推模式把 job 直接置 running 会让 worker-cron-tick 的 `eq('status','scheduled')` 落空（不会重复领），但反过来若 worker-cron-tick 先把 job 改成 `queued`，旧 dispatch 就查不到——**状态机竞争是"互相吞任务"而不是稳定重复**；真正的重复发布风险在于：旧 dispatch 已经 HTTP 推给旧 Worker 的同一 target，`status` 仍可能是 `pending`（旧代码只更 job 不保证把 target 置终态），随后被新 Worker 再 claim 一次 → 同一条内容发两次。当前生产只有 1 个 xhs 账号且 cookie `expired`，所以还没实际撞上。

## 2) 一键成片 → marketing_assets 镜像

事实（一键走的是 `marketing_video_jobs`，不是 `video_generation_jobs`，后者是自定义导演台）：
- `render-marketing-video` 在提交任务时就**预先 insert 一行 `marketing_assets`**：`kind='video'`、`output_url=null`、`input_image_urls`、`meta.job_id=<parent job id>` 及大量 meta（render_mode/duration/style/model 等）。
- `poll-marketing-video`（cron 每分钟 sweep）里的 `updateAssetMeta()` 通过 `user_id + kind='video' + meta->>job_id` 定位那一行，成功时写 `output_url`；若是火山 TOS 签名链接则 `mirrorTosVideoToStorage()` 转存 Storage，写 `meta.storage_path/tos_url_original/mirrored_at`；失败只写 `meta.mirror_error/mirror_retry_at` 并 `console.warn`。
- **重试机制：没有。** `mirror_retry_at` 只是记录，无任何代码扫描它重试；转存失败时 `output_url` 会落成 24h 过期的 TOS 签名链接（或保持 null），之后不会自愈。
- 若那行 asset 被删/查不到（`maybeSingle` 返回空），函数直接 return，**成片 URL 不会写进素材库**，也不报警。
- 导演台侧：`compose-callback` 用 `meta.director_job_id` 做 upsert（幂等，封面放 meta，正确）；但 `director-complete-job` 的 insert 里带了 **`cover_url` 字段，而 `marketing_assets` 根本没有这一列**（列只有 id/user_id/kind/input_image_urls/output_url/output_text/meta/published_platforms/published_at/created_at/shop_id/tags/category/sha256）→ 该路径 insert 必然报错。

## 3) automation-tick 的"未被用过"规则

事实（`automation-tick/index.ts` L160-182）：
- 候选：`marketing_assets` 中 `kind = filter.kind || 'video'`、`output_url IS NOT NULL`，按 `created_at desc` 取 30 条；可选 `category` 等值、`tags` overlaps；**只有 `task.shop_id` 非空时才按 shop 过滤**。
- 去重：查 `social_publish_jobs.asset_id IN (候选ids)`，取第一个不在集合里的 asset。即"未被任何 job 用过" = **在 `social_publish_jobs.asset_id` 上从未出现过（不分状态，失败/取消的 job 也算已用过，永久拉黑）**。
- 因此**刚生成的一键视频是可以被选中的**，前提是：poll 已回填 `output_url`（否则被 `not null` 过滤掉）、`kind='video'`、且 `shop_id` 与 task 匹配（ERP 任务 `shop_id` 为空时不过滤，可选到任意门店素材）。手动 `dispatch-job-create` 发过一次后该素材永久退出自动池。

## 4) 建议（待你确认后再执行，本次未做任何变更）

保留：**拉模式** `worker-cron-tick` + `worker-callback`（有 claim_token、过期回收、幂等回调）。
禁用：cron job 2 `social-publish-dispatch-every-min`（源码已不在仓库、推模式、与拉模式抢单）。

最小修复点（4 项，均未执行）：
1. `cron.unschedule('social-publish-dispatch-every-min')`，并删除该已部署的孤儿 Edge Function。
2. 新增 cron 每分钟调用 `worker-cron-tick` 的"到点入队/回收"职责——或改为保留仓库内的 `dispatch-cron-tick` 专职做 scheduled→queued + 30 分钟超时回收，让 worker-cron-tick 只负责 claim（避免两处都做入队）。二选一。
3. 修 `director-complete-job`：去掉不存在的 `cover_url` 列，封面放 `meta.cover_url`（与 compose-callback 对齐）。
4. 给 `poll-marketing-video` 的镜像失败加一次真实重试：sweep 时扫 `meta.mirror_error IS NOT NULL 且 output_url 为 TOS/为空` 的 asset 重新转存；`updateAssetMeta` 找不到 asset 时按 `meta.job_id` 补建一行。

另（上轮已提，仍未修）：`wechat_channels` / `wechat_video` 平台命名不一致；`worker-callback` 写 `active` 而 `dispatch-account-login` 写 `valid`，健康状态两套值。
