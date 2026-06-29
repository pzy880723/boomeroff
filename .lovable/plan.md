下面是给腾讯云 kiki 助手的「需求清单」，**整段复制粘贴**发给它即可。它给你回的东西你转给我，我就能直接开工。

---

# 给腾讯云 kiki：Lovable 项目数据灾备到腾讯云 · 需求清单

你好 kiki，我有一个跑在境外 Serverless Postgres + S3 兼容对象存储上的 Web 项目，想把**全部数据每天自动同步一份到我自己的腾讯云**做灾备。代码已在 GitHub，本次只解决数据。请帮我把下面这些资源开好、把参数发给我。

## 一、需要你帮我开通 / 创建的资源

### 1. 对象存储 COS（必须，主备份载体）
- **1 个 Bucket**，用于存数据库 dump 和 Storage 镜像文件。
- 地域：**`ap-shanghai`**（如你建议别的请告诉我原因）。
- 访问权限：**私有读写**。
- 开启**版本控制**（防止误覆盖）。
- 生命周期规则：
  - `db-backups/` 前缀：30 天后转**低频存储**，180 天后转**归档**，365 天后删除；但每月 1 号那份永久保留。
  - `storage-mirror/` 前缀：保留最新版本即可，旧版本 30 天后清理。
- 估算容量：当前约 20–50 GB，后续每月增长 5–10 GB。

### 2. CAM 子账号（必须，给我的备份程序用）
- 新建一个**编程访问子账号**（不要主账号 key）。
- 只授予以下最小权限，**Resource 锁死到上面这一个 bucket**：
  - `cos:PutObject`
  - `cos:GetObject`
  - `cos:HeadObject`
  - `cos:DeleteObject`
  - `cos:ListParts` / `cos:InitiateMultipartUpload` / `cos:UploadPart` / `cos:CompleteMultipartUpload` / `cos:AbortMultipartUpload`（大文件分块上传需要）
  - `cos:GetBucket`（列对象）
- 给我这个子账号的 **SecretId / SecretKey**。

### 3. 云数据库 PostgreSQL（可选，做"热备"才需要）
- **TencentDB for PostgreSQL**，版本 **15 或以上**。
- 规格：2 核 4 GB，100 GB SSD 起步即可。
- 地域同 COS：`ap-shanghai`。
- 开启**外网访问**（限我提供的 IP 白名单，下面第三部分会列）。
- 给我：实例的外网连接地址、端口、初始 superuser 账号密码。

> 如果暂时不想花这个钱，**只开 COS 也能用**——我会把全库 dump 成 `.sql.gz` 存到 COS，需要恢复时再临时开 PG 实例。请告诉我你的选择。

## 二、请告诉我以下信息

请把下列内容**逐条回复**给我，我会原样转给我的开发 Agent：

1. COS Bucket 完整名（格式形如 `mybucket-1300000000`，**末尾的 APPID 数字不能漏**）。
2. COS 所在地域代码（如 `ap-shanghai`）。
3. COS 访问域名（默认应为 `https://<bucket>.cos.<region>.myqcloud.com`，请确认或给出自定义域名）。
4. 子账号 **SecretId**。
5. 子账号 **SecretKey**。
6. （若开了 PG）实例外网地址 + 端口 + superuser 账号密码 + 默认数据库名。
7. 你建议我在 CAM 里限制的源 IP 段（见下面第三部分），如果你有更安全的建议也请提出。

## 三、关于 IP 白名单 / 网络

我的备份程序跑在境外 Serverless 平台上，**出口 IP 不固定**。请按以下方案二选一帮我配置：

- **方案 A**（更安全，推荐）：COS 用**临时密钥 STS**——但我这边发起方拿不到固定 IP，所以请确认子账号策略里**不要绑定 IP 限制**，只靠 SecretKey 鉴权 + bucket resource 锁死。
- **方案 B**：如果你坚持要 IP 白名单，请告诉我 COS / TencentDB 是否支持 `0.0.0.0/0` 之外的"按地区"放通，或建议我加一台**香港轻量服务器**做中转。

## 四、我会怎么用这些资源（让你心里有数）

- 每天凌晨 3 点（北京时间）：把全库 `COPY ... TO STDOUT` 导出，gzip 后用**分块上传**写到 `cos://<bucket>/db-backups/YYYY-MM-DD.sql.gz`。
- 每 30 分钟：增量同步 5 个 Storage 桶里的新增 / 变化文件到 `cos://<bucket>/storage-mirror/<bucket-name>/<path>`，用 ETag 对比避免重复上传。
- 每周一凌晨 4 点：从 COS 取最新 dump，做一次完整性校验（条数对比）。
- 调用 COS 用官方 `cos-nodejs-sdk-v5`（npm 包），通过 SDK 的分块上传 API 处理大视频文件（单文件可能 200 MB+）。

## 五、费用预算确认

请给我一个**月度预估账单**：
- COS（按 50 GB 标准存储 + 每月 30 GB 写入 + 5 GB 读出估）
- 若开 PG：2C4G + 100 GB SSD + 100 GB 外网下行流量

如果月度超过 **150 元**，请提示我并给出更省钱的替代方案。

---

## 我的开发 Agent 拿到你的答复后会做什么（参考，不需要你执行）

1. 把你给的 4 个值（SecretId / SecretKey / Bucket / Region）注入我的后端 Secret。
2. 在我的项目里新增 3 个备份任务 + 1 个管理面板（已有方案）。
3. 当晚跑首次全量备份，第二天给你回滚演练结果截图，确认链路通。

请直接按上面 5 部分逐条回我。谢谢 kiki 🙏

---

## 你（用户）需要做的事

1. 把上面整段（从 "你好 kiki" 到 "谢谢 kiki 🙏"）复制给腾讯云 kiki 助手。
2. 把它的回复（特别是 SecretId / SecretKey / Bucket 名 / Region）发回来给我。
3. 我会把这 4 个值通过 `add_secret` 安全存入后端（**绝不写进代码或 GitHub**），然后开始建表 + 写 3 个备份 Edge Functions + 在 `/portal` 加「数据备份」面板。

要不要我现在就把后端表结构和管理面板先建好（不依赖 kiki 回复也可以做），等密钥拿到再直接接通？