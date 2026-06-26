
# 多平台一键发布方案（接入 social-auto-upload）

## 一、整体架构

```text
 Lovable 前端 (React)
      │  HTTPS + JWT
      ▼
 Supabase Edge Function（编排层 / 鉴权 / 写库）
      │  HTTPS + worker token
      ▼
 你的 VPS：sau-worker (FastAPI + Playwright + social-auto-upload)
      │
      ├─ /accounts/login        ← 起浏览器 → 截二维码图 → 返给前端
      ├─ /accounts/login/status ← 轮询登录是否成功
      ├─ /accounts/list         ← 列出当前 cookie 状态
      ├─ /publish/video         ← 发视频（platforms[]）
      ├─ /publish/image-text    ← 发图文（小红书等）
      └─ /jobs/{id}             ← 任务状态 + 日志 + 平台返回链接

 cookies 文件按 shop_id/platform/account_id 分目录存放在 VPS 本地
```

为什么这么分层：social-auto-upload 是 Python + Playwright，必须常驻浏览器 + 持久 cookie，跑不进 Edge Function；Edge Function 只做"鉴权 + 转发 + 写状态"，把 worker token 藏在后端永不下发到浏览器。

## 二、需要你做的事

1. 一台 Linux VPS（2C4G 起，开 443 或反代）。
2. 我交付一个 Docker Compose：`social-auto-upload` 源码 + 我写的 FastAPI 包装层 + Playwright 镜像 + 一个挂载卷 `/data/cookies`。
3. 你设一个 `SAU_WORKER_URL` 和 `SAU_WORKER_TOKEN`，存进 Lovable Cloud Secrets。

## 三、数据库新增（migration）

```text
social_accounts                    每家店在每个平台绑的每个号
  id, shop_id, platform,           douyin/xhs/wechat_video/kuaishou/bilibili/tiktok
  account_name, avatar_url,
  worker_account_key,              worker 端 cookie 目录名（不暴露给前端）
  cookie_status,                   active / expired / invalid
  last_check_at, created_by, created_at

social_publish_jobs                每条"一键发布"任务（一个父任务）
  id, shop_id, asset_id, kind,     video / image_text
  title, desc, tags[], cover_url,
  schedule_at,                     null = 立即
  created_by, created_at

social_publish_targets             父任务在每个平台/账号的子任务
  id, job_id, account_id, platform,
  worker_task_id,                  worker 返回的任务 id
  status,                          queued/running/success/failed
  platform_url,                    发布成功后的作品链接
  error_message, started_at, finished_at
```

全部 `ENABLE ROW LEVEL SECURITY` + `GRANT SELECT/INSERT/UPDATE ... TO authenticated`；策略：店员只能看/操作 `shop_id ∈ 我有权限的店`，管理员通看。

## 四、Edge Functions

| 函数 | 作用 |
|---|---|
| `social-account-login-start` | 收 `{shop_id, platform}` → 调 worker `/accounts/login` → 返二维码图 url + `session_id` |
| `social-account-login-poll` | 轮询 worker 直到成功 → 写 `social_accounts` |
| `social-account-list` | 列某店所有号 + cookie 状态 |
| `social-account-refresh` | 单号重新登录（cookie 过期场景） |
| `social-account-delete` | 删号 + 通知 worker 清 cookie |
| `social-publish-create` | 收发布参数 → 创父任务 + N 个子任务 → 调 worker 入队 → 立即返回 job_id |
| `social-publish-status` | 拉父任务 + 所有子任务，给前端轮询/Realtime 兜底 |
| `social-publish-cancel` | 子任务级取消 |

worker 完成后 webhook 回打 `social-publish-webhook` 写回 `platform_url / status / error_message`，前端通过 Supabase Realtime 订阅 `social_publish_targets` 实时刷状态。

## 五、前端设计（重点）

### 1. 在 `/me/marketing/library` 视频/图片详情弹窗 (`AssetDetailDialog`) 加入口
   原"下载 / 生成文案"按钮旁加 **"一键发布 ✈️"** 主按钮。

### 2. 新页面 `/me/marketing/publish/:assetId` —— 发布工作台
```text
┌─────────────────────────────────────────────┐
│  ← 返回                              ✈️ 发布  │
├─────────────────────────────────────────────┤
│  [封面缩略图]   素材名 · 15s · 9:16          │
├─────────────────────────────────────────────┤
│  发布模式  ⦿ 一键全平台   ◯ 分平台精修       │
├─────────────────────────────────────────────┤
│  标题 (各平台共用)        [____________]   │
│  正文/文案               [____________]   │
│  标签  #古着 #中古  + 添加                  │
│  发布时间  ⦿ 立即  ◯ 定时 [12-26 20:00]     │
├─────────────────────────────────────────────┤
│  选择账号（按店铺分组，自动只展示当前店）       │
│  ┌─ 抖音 ──────────────────────┐            │
│  │ ☑ @中古阿喵 ●在线           │            │
│  │ ☐ @阿喵小号  ⚠cookie已过期 重新登录 │     │
│  └─────────────────────────────┘            │
│  ┌─ 小红书 ─────────────────────┐            │
│  │ ☑ @中古阿喵                  │            │
│  └─────────────────────────────┘            │
│  ┌─ 视频号 + 绑定账号 ───────────┐            │
│  └─────────────────────────────┘            │
├─────────────────────────────────────────────┤
│         [取消]        [开始发布 →]          │
└─────────────────────────────────────────────┘
```

"分平台精修"模式切换后，标题/文案/标签下方展开 Tab，每个平台独立一份。

### 3. 发布中弹窗 `PublishProgressDialog`
和现在视频生成进度条同款，每个平台一行：

```text
抖音 · @中古阿喵     [██████░░░░] 60% 发布中…
小红书 · @中古阿喵   [██████████] ✅ 已发布 [查看]
视频号 · @中古阿喵   [██░░░░░░░░] ❌ 失败 "需要重新登录" [重试][去登录]
```

可关闭，后台继续跑 —— 用 `localStorage` + Realtime 复刻 `surpriseJob` 那套机制，再次进入素材库会显示 "× 个发布任务进行中" 浮条。

### 4. 新页面 `/me/marketing/social-accounts` —— 账号管理
入口放在「营销中心」首页 BOOMER Hero 卡下方加一行：

```text
🔗 自媒体账号   抖音 2 · 小红书 1 · 视频号 1     >
```

页面内容：
- 按平台分组的账号卡，显示头像、昵称、cookie 状态、最后校验时间。
- 每张卡操作：`重新登录`、`检测有效性`、`解绑`。
- 顶部「+ 添加账号」→ 弹出 `AddSocialAccountDialog`：先选平台 → Edge Function 拉二维码 → 全屏展示二维码 + 倒计时 + "已扫码请在手机确认" → 自动轮询 → 成功后回填昵称头像。

### 5. 店员权限可视化
店员只能看到自己 `shop_id` 的账号；管理员页眉多一个店铺 picker（复用现有 `ShopPicker`），可切店看/发。

### 6. 历史记录
`/me/marketing/publish/history`：按时间倒序列出父任务 + 每平台状态徽章 + 作品链接复制按钮，支持失败重试整条或单平台。

## 六、风险点与边界条件

- **平台风控**：高频/同号多账号会触发验证。worker 端按账号做最小 30s 间隔，前端发布按钮发起后 disable 5s。
- **Cookie 过期**：worker 启动时定时 health-check，过期写回 `cookie_status='expired'`，前端账号卡和发布工作台都标红，引导一键重登。
- **视频源**：worker 不走 Supabase Signed URL（容易过期），编排层先用现有 `download-marketing-asset` 把视频下载到 worker，再传给 social-auto-upload。
- **图文模式**：第一版只接小红书图文（其他平台后续按需扩）；图片走 R2/Storage 公网代理同样思路。
- **不上传 social-auto-upload 源码到本仓库**（避免许可证混入），我们只调它的 HTTP 接口，源码留在你 VPS 上。

## 七、实施分批

1. **批 1（基建）**：数据库迁移 + worker 部署文档 + `social-account-*` Edge Functions + 账号管理页 + 二维码登录闭环。
2. **批 2（发布）**：`social-publish-*` Edge Functions + 发布工作台（仅"一键全平台"模式）+ 进度弹窗 + Realtime 回写。
3. **批 3（精修）**：分平台 Tab、定时发布、失败重试、发布历史页、图文模式。
4. **批 4（打磨）**：店铺 picker 接入、视频生成完成后弹"是否直接发布"、首页 hero 加"今日已发 N 条"指标。

确认这套方案，我先做"批 1：账号管理 + 扫码绑定 + worker 部署文档"，跑通后再上发布链路。
