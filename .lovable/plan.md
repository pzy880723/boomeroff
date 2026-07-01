## 当前备份状况：**不正常，且没备份全**

### 一、直接结论

| 项 | 情况 |
|---|---|
| 数据库表（58 张） | ✅ 每次都能跑完，几秒钟；内容完整 |
| 图片（product-images / avatars / voucher-screenshots / activity-posters）| ⚠️ 部分备份；每次只能跑一小段就超时 |
| 视频（marketing-videos，711 MB / 314 个文件）| ❌ 基本没备成功——大文件 PUT 到腾讯云 COS 触发 Gateway Timeout |
| 定时任务 | ❌ 最近 3 天的凌晨 cron 全部失败，报"跑得太久，自动结束" |

### 二、最近 10 次运行都在同一个坑

- **今天 09:16** 手动触发：跑到 `marketing-videos/…/1777549950775-rjhtcf.jpg`（其实是大文件）时 **COS 返回 Gateway Timeout**，然后 status 一直卡在 running
- **今天 09:00** 失败，同类错误
- **6-30 / 6-29 凌晨 cron** 都被"看门狗"判定超时，标记 failed
- 每次进度不同 → 说明是**逐批推进**，但**一直没能把 marketing-videos 全推完**

### 三、根因

1. **单文件太大 + 一次性 PUT**：`cosPutObject` 是一次性把整个 Blob 塞给腾讯云，几十 MB 的视频在 Edge Function 网络上很容易触发 COS 侧的 504。目前没重试、没分片。
2. **看门狗把正在跑的当成僵尸**：`backup-all-to-cos` 用"上次 started_at 超过 X 分钟就标记失败"来自愈，但大视频批次本来就慢，导致 cron 每次一开跑就被上一次的残影踢掉。
3. **没有断点续跑指针**：每次重启都从头扫 bucket，永远先卡在同一个大视频上，后面的小文件根本轮不到。

### 四、你问的两个问题的答案

- **"备份速度正常吗？"** → 数据库正常（秒级）；图片视频**不正常**，Edge Function 单 tick 15 分钟根本推不完 700 MB 视频，加上没重试，实际吞吐几乎为 0。
- **"包含所有数据了吗？"** → 数据库表全的（58 张都在 `db-backups/daily/YYYY-MM-DD/tables/`）。**Storage 只有一小部分**：product-images 应该大半都在，marketing-videos 大概率**只备了几个小的**，711 MB 的视频还没镜像到腾讯云。
- 未包含：`auth.users`（Supabase 托管，导不出，用户 ID 保留在 `profiles`/`user_roles` 里）。

---

## 修复计划

### A. 让大文件真正传得上去（`_shared/tencentCos.ts` + `backup-all-to-cos`）

1. **给 `cosPutObject` 加自动重试**：504 / 网络错 → 指数退避重试 3 次；仍失败就跳过并记进 `error_message`，不阻塞后续文件。
2. **> 20 MB 文件走 COS 分片上传**（Initiate / UploadPart / Complete）：8 MB 一片、并发 2 片，避免单请求超时。给 `_shared/tencentCos.ts` 加 `cosMultipartUpload`。
3. **单 tick 内单文件预算**：任何一个文件超过 90 秒还没传完就跳过，塞回下一 tick 重试，防止一个坏文件卡死整轮。

### B. 断点续跑，别每次从头扫

4. `backup_runs.metadata` 里记 `cursor = { bucket, last_key }`；每 tick 结束前写回，续跑时从 last_key 之后 `list()`，小文件很快就能跑完。
5. **先按 size 升序处理**（其实 Storage list 已按 name，改成按 bucket 优先级 + skip-large-in-first-pass）：第一轮跳过 > 50 MB 文件先把大量小文件全备完，第二轮再啃视频，这样即使视频阶段挂了，"图片 100%"也已达成。

### C. 让 cron 不再自己踩自己

6. 看门狗阈值从当前值调到 25 分钟；且 **只在 status='running' 且 last heartbeat 超时** 才踢——加一个 `heartbeat_at` 字段每 tick 更新，避免"正常跑但没心跳"被误杀。
7. cron 触发前如果发现 15 分钟内有 running 的实例，直接跳过本次（而不是把它标 failed 再自己开一个）。

### D. 可观测性

8. `BackupPanel`（/portal → 数据备份）显示：
   - 每个 bucket 的"已镜像 / 总文件数"进度条（用 `metadata.per_bucket`）
   - 最近失败文件列表 + 一键"只重试这些"按钮
9. 一次性写个"补齐脚本"按钮：只跑 marketing-videos，把历史遗漏一次性补完。

### 技术细节（可跳过）

- 腾讯云 COS 分片：`POST /?uploads` → `PUT ?partNumber=N&uploadId=…` → `POST ?uploadId=…` 带 XML；签名沿用现有 `signCos`，pathname 需要包含 query。
- 心跳更新用轻量 `update backup_runs set metadata = jsonb_set(...) where id=$1`，别 select 全 row。
- 分片并发用 `Promise.allSettled`，失败 part 单独重试。

### 预期效果

- 首次跑完后：**5 个 bucket 全量镜像**（≈ 1.17 GB），耗时约 8–15 分钟；之后每天增量只传新增文件，1–2 分钟结束。
- cron 稳定成功；`backup_runs` 里不再出现"跑得太久，自动结束"。
- `docs/backup-locations.md` 里的目录结构不变，外部读取方式不受影响。

---

要我按这个计划执行吗？（如果你只想先"补齐 marketing-videos"，也可以只做 A + D-9 的一次性补齐按钮。）