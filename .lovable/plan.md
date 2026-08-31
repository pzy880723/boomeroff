# 诊断结论：点击「生成视频」后卡住的真实根因

## 结论（可验证）

`surprise-marketing-video` 在提交分支里查询参考图时 SELECT 了一个**数据库中不存在的字段 `description`**，PostgREST 直接返回 42703 错误，函数在任何数据库写入之前就 `return 500 读取参考图失败`。因此脚本任务永远停在 `script_ready`，`marketing_video_jobs` 也不会新增行。

证据：

- `supabase/functions/surprise-marketing-video/index.ts` 第 174、181 行：
  `.select('id, output_url, description, category, tags, meta')`
- `public.marketing_assets` 实际字段：`category, created_at, id, input_image_urls, kind, meta, output_text, output_url, published_at, published_platforms, sha256, shop_id, tags, user_id` —— **没有 `description`**。
- 该 SELECT 位于 claim 之前（claim 在第 254 行才把 status 改成 `submitting`、写入 `submission_token`），所以失败时不留任何 DB 痕迹。
- 任务 `55e1f864-5644-4dae-98b3-ceba78169644`：`updated_at = 2026-08-31 05:30:11.145Z`，与 `meta.manually_edited_at = 05:30:10.936Z` 仅差 200ms，即最后一次写库来自「手动改脚本保存」（surprise-script-job），此后没有任何写入；`meta` 里没有 `submission_token` / `render_job_id`，证明 claim 从未执行。
- `marketing_video_jobs` 近 24 小时 0 行，最后一行 `2026-08-29 11:47:17Z`；最后一次 surprise 成片是 `2026-07-29`。
- 已排除其他分支：本地用生产数据跑 `validateSurpriseScript`（脚本 5 段 19/19/19/19/18 汉字，合计 94）→ `errors = []`；`picked_assets` 9 张均属该门店（shop `0d2fdb41…`，kind=photo），归属校验不会抛错。
- 引入时间：commit `b2083628`（2026-08-30 23:20 +0800）修改了该文件并带入这一 SELECT；这也解释了 08-30 起 3 条草稿（06:58、11:27、以及本次）全部停在 `script_ready`。

## 关于部署版本

- 本地 HEAD = `4235dc2e9f8dc42e6b90abc31abceec0bfede519`（含上述有问题的 SELECT）。
- 生产三支函数均能正常启动：无 token 请求 `surprise-script-job` / `surprise-marketing-video` / `render-marketing-video` 均返回 `401 {"ok":false,"error":"未授权"}`，无 BOOT_ERROR。
- 无法用日志佐证 05:30 那次调用：本项目 Edge 日志查询窗口只回溯约 10 分钟（`function_edge_logs` 可见范围 05:56–06:06Z），05:30 的记录已不可查；日志中也没有任何 surprise 相关 URL 命中。因此“请求最后到达哪个函数”是由数据库写入痕迹推断的，不是由日志。

## 修复方案（待批准后执行，仅一处改动）

1. 把 `supabase/functions/surprise-marketing-video/index.ts` 第 174、181 行的 SELECT 改为实际存在的字段：`'id, output_url, output_text, category, tags, meta'`（`summarizeAsset` 若引用 `description`，同步改读 `output_text`/`meta`）。
2. 重新部署 `surprise-marketing-video`。
3. 把 3 条卡住的 `script_ready` 草稿保持原样，由用户在 App 内重新点击「生成视频」验证；确认 `video_generation_jobs.status` 走到 `rendering` 且 `marketing_video_jobs` 新增一行。

不改 UI、不改数据库结构、不改脚本生成逻辑。
