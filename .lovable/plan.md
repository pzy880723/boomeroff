
# 接入 social-auto-upload（修订版 · 适配 aigc.boomeroff.top 已部署服务）

## 关键差异（对比原方案）

读了真实接口文档后，原方案要调三处：

| 原方案 | 实际情况 | 处理 |
|---|---|---|
| 我交付 Docker Compose 给你部署 | **服务已部署在 `aigc.boomeroff.top`**，无需我做 | 跳过部署，只需你把 DNS A 记录 `aigc.boomeroff.top → 150.158.94.248` 加上 |
| Worker 有 token 鉴权 | 实际接口**没有任何鉴权**，谁都能调 | 多店隔离改由我们在 Edge Function 层 + DB 做；强烈建议你在 Nginx 上加 `X-Sau-Token` Header 鉴权（我会写文档），否则任何人知道域名就能发别人账号 |
| 长连接登录 = 起浏览器 + 二维码图 + 轮询 | **SSE 流**：`GET /login` 直接推 `{status:'qrcode', image:'/getFile?filename=...'}` 再推 `success` | 前端通过 Edge Function 反代 SSE（worker 是 HTTP，浏览器 HTTPS 会被 mixed-content 拦截）|
| 多店多账号 cookie 目录 | 全局账号池，按"自定义账号名 id"区分（worker 用 `id` 当 cookie 文件名） | 用命名规范 `shop_{shopId前缀}_{我们生成的别名}` 注入到 worker，DB 里 `worker_account_key` 存这个 |
| 同时支持图文 | **接口里没有 image-text，只能发视频** | 第一版只做视频；图文等 worker 加接口再补 |
| Worker 推 webhook 回我们 | 文档里**没有 webhook** | 改成：发布后 Edge Function 起轮询任务（cron 每 30s 查 `/getValidAccounts` + 内部状态），把结果写回 `social_publish_targets` |

平台编号：`1=小红书、2=视频号、3=抖音、4=快手`（B站、TikTok 这个 worker 暂不支持，UI 里隐藏）。

## 修订后的整体架构

```text
 浏览器 (HTTPS)
    │
    ├─ EventSource ──→ /functions/v1/social-login-stream  (HTTPS SSE)
    │                          │ HTTP 反代
    │                          ▼
    │                  aigc.boomeroff.top/login?type=&id=
    │
    └─ fetch ────────→ /functions/v1/social-*
                              │
                              ├─ 调 worker /getAccounts /postVideoBatch /upload …
                              └─ 写 social_accounts / social_publish_jobs / _targets
```

Edge Function 全部加 `verifyJwt = true` + 校验 `shop_id ∈ 当前用户可见门店`，绝不把 worker 域名暴露给前端，避免越权直连。

## 数据库

保留批 1 已经建好的三张表（`social_accounts` / `social_publish_jobs` / `social_publish_targets`）。一处微调：

- `social_accounts.worker_account_id`（新增 int 列）：缓存 worker `/getAccounts` 返回的全局账号 ID，用于发布时填 `accountList`。
- `social_publish_jobs.worker_file_path`：worker `/upload` 返回的 `uuid_video.mp4`。

这俩用一次 ALTER 增量迁移。

## Edge Functions（替换原 8 个）

| 函数 | 实现要点 |
|---|---|
| `social-worker-config` | 公共模块，读 `SAU_WORKER_URL` + 可选 `SAU_WORKER_TOKEN`，统一 fetch 封装 |
| `social-login-stream` | **SSE 反代**：`GET ?shop_id&platform&alias` → 校验权限 → 生成 `worker_account_key` → 流式转发 worker `/login` → 把 `image` 路径改写成绝对 URL → 收到 `success` 立即调 `/getAccounts` 拿到新 worker_id → 写 `social_accounts` |
| `social-account-list` | 拉 worker `/getAccounts`，按 shop_id 过滤后返回我方 DB 视图 |
| `social-account-check` | 调 worker `/getValidAccounts`，回写 `cookie_status` |
| `social-account-delete` | DB 删 + worker `/deleteAccount?id=` |
| `social-publish-create` | 1) 校权 2) 下载 asset 视频字节 3) POST worker `/upload` 4) 创父子任务 5) POST `/postVideoBatch`（按平台分组）6) 返回 job_id |
| `social-publish-status` | 拉父任务 + 所有子任务给前端轮询/Realtime 兜底 |
| `social-publish-tick`（cron 30s） | 把 `running` 状态超 N 秒的子任务标记完成（worker 没回执，只能以"已提交"为成功，失败信息靠人工/账号失效推断）|
| `social-asset-proxy` | 把 worker 的 `/getFile?filename=xxx.png` 二维码图代理出 HTTPS |

## Secrets

只需一个：

- `SAU_WORKER_URL` = `http://aigc.boomeroff.top`
- 可选 `SAU_WORKER_TOKEN`（如果你按建议在 Nginx 上加了鉴权 Header）

## 前端调整（相对原方案的 differences）

1. **账号管理页**：平台只显示「抖音 · 小红书 · 视频号 · 快手」四个，B站/TikTok 灰掉提示"该平台暂不支持"。
2. **扫码弹窗**：用 `new EventSource('/functions/v1/social-login-stream?...')` 直接消费 SSE；状态机 `connecting → qrcode → scanning → success/error`。
3. **发布工作台**：定时发布 UI 暴露 worker 的 `videosPerDay/dailyTimes/startDays`（抖音/视频号支持）。
4. **发布进度弹窗**：因为 worker 不回执，单条子任务展示为「✅ 已提交至抖音 · 请到平台后台查看」+ 一个「检测账号是否在线」按钮（调 `social-account-check`）。文案上写清楚 **"已提交"不等于"已发布成功"**，避免误导。
5. **首页入口**：BOOMER Hero 卡下方新增「🔗 自媒体账号」一行，跳到 `/me/marketing/social-accounts`。
6. 视频详情弹窗 (`AssetDetailDialog`) 加 **"一键发布 ✈️"** 按钮跳 `/me/marketing/publish/:assetId`。

## 风险与你需要做的事

1. **DNS 必须落地**：`aigc.boomeroff.top → 150.158.94.248`，否则我们 Edge Function 也连不上。
2. **建议给 worker 加一道鉴权**（Nginx `if ($http_x_sau_token != "xxx")` 401），否则你的账号池任何人都能用。我会在 README 给一份完整 Nginx 片段。
3. **160MB 文件上限**：超过的视频上传会失败，前端先校验。
4. **HTTP 反代到 HTTPS**：worker 是 HTTP，全部走 Edge Function 反代；前端任何代码都禁止直连 `aigc.boomeroff.top`。
5. **平台风控**：同号高频会被封；前端发布按钮 disable 5s + worker 端账号间隔由你那边控制。
6. **法律声明文案**：发布工作台底部加灰字"本工具通过模拟登录代发布，账号风险自负"。

## 分批落地（不变，但批 1 缩减）

1. **批 1（基建·缩减）**：增量 ALTER 表 + `social-worker-config` + `social-login-stream`(SSE) + `social-account-list` + `social-account-check` + `social-account-delete` + 账号管理页 + 扫码弹窗 + Nginx 加固文档。
2. **批 2（发布）**：`social-publish-create/status/tick` + 视频上传到 worker 的字节直通 + 发布工作台 + 进度弹窗。
3. **批 3（精修）**：定时发布 UI、分平台 Tab、失败重试、发布历史。
4. **批 4（打磨）**：店铺 picker、生成完成自动弹"是否直接发布"、首页"今日已发 N 条"。

确认这个修订方案后，我就开干批 1。
