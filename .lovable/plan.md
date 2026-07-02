## 目标

让备份变成真正的「增量续跑」：维护一份**持久成功清单**，每次开跑先读清单跳过已成功文件，再挑未备份的上传；跑完把新成功的追加进清单并同步到 COS，永不重复备份。

## 现状问题

1. 现在每一轮 tick 都用 `cosListPrefix` 拉一次桶清单来判断"是否已存在"。跨境 LIST 慢，且如果单次 tick 没跑完，下一轮又要重新 LIST。
2. 失败的文件混在 `backup_runs.metadata.errors` 里，前端"只重试失败文件"只能针对**上一次**那条记录，跨多次运行会漏。
3. 没有"全局已成功"的真相源。同一个 run 内部重试是 OK 的，但跨 run 就靠 LIST 兜底。
4. 用户看到 UI 报「上传失败 2 个」但实际远不止——因为 `MAX_FILES_PER_RUN=500` 的截断被当成"成功"，剩下的根本还没轮到。

## 方案：持久化「成功清单」+ 失败台账

### 1. 新建两张表（迁移）

- `backup_file_ledger`
  - `cos_key`（主键）
  - `source_bucket`（`storage:product-images` 或 `db:table_name`）
  - `source_path`
  - `size`、`etag`
  - `first_backed_up_at`、`last_verified_at`
  - `content_hash`（可空，用于日后校验）
  - RLS：仅 admin 可读，service_role 全权
  - 索引：`(source_bucket, source_path)`
- `backup_file_failures`
  - `id`、`cos_key`、`source_bucket`、`source_path`、`size`
  - `error_message`、`attempt_count`
  - `first_failed_at`、`last_attempt_at`
  - `resolved_at`（成功后置位，不删记录，方便审计）
  - RLS 同上；索引：`(resolved_at, source_bucket)` 用于快速查"仍失败"

### 2. `backup-all-to-cos` 逐段改造

- **启动阶段**：一次性把 `backup_file_ledger` 里 `source_bucket` 命中的所有 `source_path` 读进内存 `Set`（几万条也就几 MB）。**不再做 `cosListPrefix`**——本地台账就是真相源。
- **扫描每个 storage bucket / DB 表时**：
  - 如果 `source_path in ledgerSet` 且 `size` 一致 → 直接算 skipped，跳过。
  - 否则加入本轮 upload 队列。
- **上传成功**：立即 `upsert` 到 `backup_file_ledger`（用 `service_role`），并写入本 run 的 manifest。
- **上传失败**：`upsert` 到 `backup_file_failures`（`attempt_count = attempt_count + 1`，记 `error_message`）。
- **run 结束**：把当前 ledger 的整体快照生成 `manifest-latest.json.gz` 上传到 COS 固定位置（`manifests/latest.json.gz`），单独 run 的 manifest 继续保留。

### 3. "只重试失败文件"改成从 `backup_file_failures` 取

- 前端按钮改为调用 `retry_failed` 时，函数直接 `select ... where resolved_at is null`，按批（比如每 tick 200 条）重试。
- 成功后：ledger 里 upsert + failures 里 `resolved_at = now()`。
- 前端面板新增一小块："累计已备份 X 个 / 待重试失败 Y 个"，Y 就是 `count(*) where resolved_at is null`。

### 4. Storage 大文件双阶段仍保留

保留现有 "先 <30MB、再大文件" 策略，只不过 skip 逻辑改为查 ledger。

### 5. 前端 `BackupPanel.tsx` 小改

- 顶部指标：`ledger.total`、`failures.pending`、`last_run.new_uploaded`。
- 失败列表改从 `backup_file_failures` 表读（分页 50 条），带"重试全部"按钮 → 触发 `retry_failed`。
- 保留"停止 / 重新开始"按钮，语义不变。

## 不改的地方

- COS 加速域名、签名、gzip、cron 5 分钟兜底、心跳、异步续跑 —— 全部保留。
- 已在 COS 里的旧文件：首次跑新逻辑时会 **一次性回填 ledger**（用 `cosListPrefix` 拉一次全量清单写入 ledger，然后就再也不 LIST 了）。这一步作为 `bootstrap_ledger` 动作单独触发，前端弹一次"首次同步已备份清单，约 1-2 分钟"提示。

## 验证

1. 迁移执行后，跑 `bootstrap_ledger`：ledger 里应该有 ≈ 已经在 COS 里的对象数（应该差不多是 2441 图片 + N DB 快照 + 视频）。
2. 点"开始新备份"：日志里应看到 `skipped_from_ledger: <大数>`，`uploaded: <小数或 0>`。
3. 点"只重试失败文件"：只处理 `backup_file_failures.resolved_at is null` 那批，处理完前端"待重试"数字应下降。
4. 手动删掉 ledger 里某一行 → 下一轮该文件会被重新上传 → 上传成功后 ledger 里重新出现。

## 用户能感知到什么

- 备份**不会**再对已成功文件反复上传，跨境流量骤降。
- "失败台账"跨 run 累积，一直能看到"还有几个没搞定"，不会因为翻页丢失。
- 每次 run 结束都有一份完整 manifest 上传到 COS，外部 APP 可以拉 `manifests/latest.json.gz` 一次性获得"目前云端有哪些备份"。
