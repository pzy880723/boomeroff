
## 目标

围绕现有 `backup-all-to-cos` 流程补齐"看得见 / 校验得了 / 修得回"三件事：完成通知 + Manifest 清单 + 失败重试 + 对账 + 更细的进度面板。

## 一、后端改造 `supabase/functions/backup-all-to-cos/index.ts`

### 1. 结构化 metadata（面板 + 通知 + 对账都靠它）

在现有 `RunMeta` 上补：

```
pass_stats: {
  database: { files_count, uploaded, failed, bytes, elapsed_ms }
  storage_pass1: { files_count, uploaded, skipped, failed, bytes, elapsed_ms }  // 图片
  storage_pass2: { files_count, uploaded, skipped, failed, bytes, elapsed_ms }  // 视频
}
failures: Array<{
  kind: 'table' | 'storage'
  bucket?: string
  path?: string           // 或 table:offset
  size?: number
  error: string           // 已 humanize
  attempts: number
  first_failed_at: string
  last_failed_at: string
}>                        // 最多保留 500 条，同 key 去重后 attempts+1
manifest_key?: string     // 全量 manifest 的 COS key
reconcile?: {
  ran_at: string
  tables_expected: number, tables_present: number, tables_missing: string[]
  storage_expected: number, storage_present: number, storage_missing: Array<{bucket,path}>
  ok: boolean
}
notified?: boolean        // 完成通知是否已写
```

每次上传成功 / 失败都累加到对应 pass_stats 与 failures；耗时用 `Date.now() - phaseStartAt`。

### 2. Manifest 清单上传（run 完成时）

`meta.phase === "done"` 那一 tick，聚合已 upload 成功的：
- 遍历 `db-backups/daily/{day}/tables/` + `_manifest/` + 汇总 `storage_pass1/2` 上传成功的对象
- 生成 `db-backups/daily/{day}/_run-manifest.json.gz`：
  ```
  { run_id, day, generated_at, tables: [{table, parts:[{key,size,etag}]}],
    storage: [{bucket,path,cos_key,size,etag,pass}],
    totals: { files, bytes }, failures: [...] }
  ```
- 记录到 `meta.manifest_key`，同时把上传返回的 `ETag`（改造 `cosPutObject` 返回 ETag，`_shared/tencentCos.ts` 里从 response headers 读取）存进 tables/storage 条目。

### 3. 对账校验（自动跑一次）

`done` 之后同一 tick 调 `runReconcile(meta, manifests)`：
- tables 期望 = TABLES.length；实际 = 本次 upload 成功 + head 存在
- storage 期望 = 各 bucket manifest 里 size ≤ MAX_FILE_BYTES 的总数；实际 = COS `HEAD` 逐个探测（对本次已 upload 过的直接算成功，剩余采样 head 抽检，避免超时）
- 差集写入 `meta.reconcile.storage_missing / tables_missing`
- 若 `missing.length > 0` 把这些补进 `meta.failures` 供"只重试失败文件"使用

### 4. 完成通知（站内消息）

`done` 且 `!notified`：向 `notifications` 表插一条：
- 收件人 = 触发 manual 的用户 / 或全部 super_admin（cron 情况）
- 标题：`备份成功 ✓ / 备份完成但有失败 ⚠️`
- 内容：`成功率 X% · 耗时 Ymin · 文件 N 个 · 失败 K 个（原因摘要 top3）`
- `metadata.link = '/portal?tab=backup&run=<id>'`

### 5. 新入口：`action` 分派

请求 body 支持 `action`:
- `run`（默认）：现有流程
- `retry_failed`：读取指定 `run_id` 的 `meta.failures`，创建**新的** run（kind='retry'），metadata 里带 `retry_of: run_id + queue: [...failures]`；主循环里若 `meta.queue`，跳过全量扫描直接消费队列
- `reconcile_only`：只跑对账（针对指定 run 补跑）

## 二、`_shared/tencentCos.ts`

- `cosPutObject` 返回 `{ size, etag }`
- 新增 `cosListPrefix({cfg, prefix, marker?})`（分页 List Objects v2 用于对账 fallback）

## 三、前端 `src/components/admin/BackupPanel.tsx`

### 1. 顶部当前 run 进度面板（run.status === 'running' 或最近一条）

三行 pass 卡片（数据库 / 图片 / 视频），每行显示：
```
[数据库] 58/58 表 · 成功 58 失败 0 · 12.3s   ████████ 100%
[图片]   1245/1400 · 成功 1240 失败 5 · 4m2s ██████░░ 89%
[视频]   3/12   · 成功 3 失败 0 · 1m30s     ██░░░░░░ 25%
```
数据来自 `meta.pass_stats` + `storage_cursor / storage_total / storage_pass`。

### 2. 完成后摘要卡片

```
✓ 备份成功 · 成功率 99.2% · 耗时 8 分 12 秒
文件 1520 · 失败 12
[下载 Manifest] [只重试失败文件] [重新对账]
```

- **下载 Manifest**：调 edge function 生成签名 URL（新增 `get-backup-manifest-url` 或复用已有签名逻辑），直接跳转 COS
- **只重试失败文件**：`invoke('backup-all-to-cos', { action:'retry_failed', run_id })`，弹 toast，轮询新的 run
- **重新对账**：`action:'reconcile_only'`

### 3. 失败明细可折叠列表

从 `meta.failures` 渲染，每项：`bucket/path` + 错误（已 humanize）+ 尝试次数 + `[跳过]`（把它从 failures 移除）。

### 4. 对账结果面板

如果 `meta.reconcile.ok === false`：红条 + "缺失 N 个（点击查看）" → 弹 Sheet 展示 `tables_missing / storage_missing`。

### 5. 通知触发

`toast` 由 realtime 订阅 `notifications` 表（新完成的 backup 消息）触发；面板挂载时 `channel('backup-notify')` 订阅当前用户新通知，type='backup' 时弹右下 toast。

## 四、数据库 migration

`notifications` 表已存在，无需新表。新增一列 `backup_runs.retry_of uuid null` 便于前端把 retry run 和原 run 关联展示。加索引 `(kind, started_at desc)`。

## 五、验证方式

1. 手动点"立即备份" → 面板出现三行 pass 进度
2. 人为改一个 bucket 权限触发几条失败 → 完成后看到失败列表 + 站内消息 + 成功率
3. 点"只重试失败文件" → 新 run 只处理 12 个失败对象，成功后失败列表清空
4. 点"下载 Manifest" → 拿到 json.gz，用 `zcat` 校验 ETag/size 完整
5. 手动删掉 COS 上某个对象后点"重新对账" → 缺失项出现在对账面板

## 交付文件

- 改：`supabase/functions/backup-all-to-cos/index.ts`
- 改：`supabase/functions/_shared/tencentCos.ts`（ETag 返回 + list prefix）
- 新：`supabase/functions/get-backup-manifest-url/index.ts`（签名下载 URL）
- 改：`src/components/admin/BackupPanel.tsx`
- 新：`src/components/admin/BackupPassProgress.tsx`、`BackupFailuresList.tsx`、`BackupReconcilePanel.tsx`
- 新 migration：`backup_runs.retry_of` + 索引
