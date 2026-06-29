## 目标
把 Lovable Cloud（后端数据库 + Storage 桶）里的全部数据，**定时增量同步一份到你自己的腾讯云**，作为独立的灾备副本。前端代码已在 GitHub，本方案只解决「数据」这一层。

---

## 你需要在腾讯云准备的资源（一次性）

| 资源 | 用途 | 规格建议 |
|---|---|---|
| **云数据库 PostgreSQL**（TencentDB for PostgreSQL）| 存放数据库镜像 | 与现有库同版本（PG 15+），2 核 4G 起步即可 |
| **对象存储 COS**（1 个 Bucket）| 存放图片 / 视频 / 截图等文件副本 | 标准存储 + 生命周期规则转低频 |
| **COS 访问密钥**（SecretId / SecretKey）| 给备份程序写入 COS 用 | 子账号 + 仅授权这一个 bucket |
| 可选：**云函数 SCF + 定时触发器** | 跑备份脚本（不想自己开服务器时用）| Node.js / Python 运行时 |

> 全部费用按目前数据量估算约每月 30–80 元（PG 实例占大头，COS 几乎可忽略）。

---

## 备份架构

```text
 Lovable Cloud (源)                  你的腾讯云 (灾备)
 ┌─────────────────┐                 ┌──────────────────────┐
 │  Postgres 数据库 │ ── 每日全量 ──► │ TencentDB PostgreSQL │
 │  57 张业务表     │ ── 每5分钟增量─►│  (同 schema, 只读)    │
 └─────────────────┘                 └──────────────────────┘
 ┌─────────────────┐                 ┌──────────────────────┐
 │  Storage 5个桶  │ ── 实时镜像  ──►│   COS Bucket         │
 │ product-images  │                 │  product-images/     │
 │ marketing-videos│                 │  marketing-videos/   │
 │ avatars / ...   │                 │  avatars/ ...        │
 └─────────────────┘                 └──────────────────────┘
```

两条管道独立运行，互不影响线上。

---

## 实施步骤

### 第一步：数据库备份（两种方式选一）

**方式 A · 推荐：Lovable Cloud 一键导出 + 你这边定时导入**
- Lovable Cloud 后台已经提供「Export data」功能（高级设置里），可以导出全库 SQL/CSV。
- 我会新增一个 **Edge Function `backup-db-to-cos`**：
  - 每天凌晨触发一次（cron）
  - 用只读 service role 把所有业务表 `COPY ... TO STDOUT` 流式打包成一个 `.sql.gz` 文件
  - 直接上传到你的 COS 的 `db-backups/YYYY-MM-DD.sql.gz`
  - 保留 30 天，老文件自动删
- 你在腾讯云 PG 上用 `psql < 文件` 一条命令即可整库还原；也可以让函数同时往腾讯云 PG 灌一份。

**方式 B · 高保真：腾讯云 DTS 异构同步**
- 适合你想要「秒级延迟、随时切换读」的场景。
- 用腾讯云 DTS 配置「外部 PostgreSQL → TencentDB PostgreSQL」实时同步。
- 需要 Lovable Cloud 数据库的 **直连地址 + 只读账号**——这部分需要先确认 Lovable Cloud 是否对外开放直连（如果不开放，只能走方式 A）。

**默认按方式 A 实施。** 简单、稳、不依赖外部权限。

### 第二步：Storage 桶备份

新增 Edge Function **`backup-storage-to-cos`**：
- 列出 5 个桶（`product-images` / `avatars` / `marketing-videos` / `voucher-screenshots` / `activity-posters`）里的所有对象
- 增量对比：用一张新表 `backup_object_log(bucket, path, etag, copied_at)` 记录已同步对象的 ETag
- 只把「新增 / ETag 变化」的对象拉下来流式上传到 COS 对应路径
- 每 30 分钟跑一次（cron），保证近实时

> 还可以配 Storage 的 Webhook（`object.created`）触发即时单文件同步，做到秒级；先用定时方案上线，确认稳定后再加 Webhook。

### 第三步：在腾讯云侧做容灾演练

- 每月手动跑一次「从 COS 取最新 SQL → 灌进 TencentDB → 抽 5 张关键表 count 对比」校验脚本，确保备份真的可用（避免「以为有备份，恢复时发现是空的」）。
- 这一步也由一个 Edge Function `verify-backup-integrity` 自动做，把校验结果发到你的通知中心。

### 第四步：密钥与权限

- 在 Lovable Cloud 加 3 个 secret：`TENCENT_COS_SECRET_ID` / `TENCENT_COS_SECRET_KEY` / `TENCENT_COS_BUCKET`（外加 `TENCENT_COS_REGION`）。
- 你在腾讯云访问管理 CAM 里**新建一个子账号**，只给 `cos:PutObject / cos:GetObject / cos:DeleteObject` 这三个权限，且 resource 锁死到这一个 bucket。**不要用主账号 key**。
- 数据库方式 A 不需要任何腾讯云 PG 密钥；方式 B 才需要。

### 第五步：前端入口（管理员可见）

在 `/portal` 增加一个「数据备份」面板：
- 上次全量备份时间、大小、文件名
- 上次 Storage 增量同步时间、本次同步文件数
- 「立即手动备份一次」按钮
- 最近 7 次校验结果（成功 / 失败 / 数据条数差异）

---

## 不在本方案内（避免你误以为做了）

- 不会备份 Lovable Cloud 的 Auth 用户密码哈希（auth schema 不允许导出）。用户表里的 `auth.users.id` 会保留，密码本身需要用户在新环境走一次「忘记密码」重置。如需 100% Auth 复原，得走方式 B 的 DTS 直连方案。
- Edge Functions 源代码、Secret 值不在备份范围——这些已经跟着 Lovable 项目走 Git，足够了。
- 不动现有任何业务表、RLS、Storage 桶设置。

---

## 技术细节（给开发看）

- 新增表：`public.backup_object_log(bucket text, path text, etag text, size bigint, copied_at timestamptz, primary key(bucket, path))`，启用 RLS，仅 service_role 可写、admin 可读。
- 新增 Edge Functions：`backup-db-to-cos`、`backup-storage-to-cos`、`verify-backup-integrity`，均 `verify_jwt = true`（admin 才能手动触发），同时配 Supabase Scheduled Functions：
  - `backup-db-to-cos`：每日 03:00 Asia/Shanghai
  - `backup-storage-to-cos`：每 30 分钟
  - `verify-backup-integrity`：每周一 04:00
- 签名上传用腾讯云官方 `cos-nodejs-sdk-v5` 的 npm 包（Deno 通过 `npm:cos-nodejs-sdk-v5` 直接 import）。
- 大文件（视频）走 COS 分块上传 + 流式 pipe，避免函数内存撑爆。
- 前端面板：新增 `src/components/admin/BackupPanel.tsx`，挂到 `/portal` 的 Tabs 里。

---

## 你需要先回答 / 准备的事

1. 腾讯云账号下的 **目标地域**（建议跟你常用机房一致，例如 `ap-shanghai` / `ap-guangzhou`）。
2. 是先走**方式 A（每日全量 SQL 到 COS，简单稳）**，还是想直接上**方式 B（DTS 实时同步到 TencentDB）**？
3. 备份保留多久（默认 30 天滚动 + 每月 1 号那一份永久保留）？

确认后我就按上面分 5 步实施，预计一次提交完成所有 Edge Functions + 管理面板。