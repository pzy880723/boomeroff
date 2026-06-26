## 目标

把 `dreammis/social-auto-upload`（SAU）当成纯后端 worker，App 这边推倒重做一套「内容分发中心」，嵌进营销中心。

- 复用现有 `aigc.boomeroff.top` worker，不再纠结之前批 1–3 留下的零碎实现
- 平台：抖音 / 小红书 / 视频号 / 快手 / B站
- 内容形态：视频（MP4）+ 图文（小红书图集、抖音图文）

---

## 1. 清掉旧实现

数据库**保留 3 张表**（`social_accounts` / `social_publish_jobs` / `social_publish_targets`），但删除以下旧代码，重新生成：

- 删除页面：`SocialAccounts.tsx`、`PublishWorkbench.tsx`、`PublishHistory.tsx`
- 删除组件：`AddSocialAccountDialog.tsx`
- 删除函数：`social-login-stream` / `social-account-list` / `social-account-delete` / `social-asset-proxy` / `social-publish-create` / `social-publish-status` / `social-publish-retry` / `social-publish-dispatch` / `_shared/social-dispatch.ts`

旧账号需要用户重新扫码（因为对齐 SAU 官方账号 schema，旧 `worker_account_id` 可能不对应）。

## 2. 数据库迁移（增量补字段）

```text
social_accounts
  + content_kinds text[]  -- ['video','image_text'] 哪些内容形态此账号能发
  + capabilities jsonb    -- 平台特性快照（话题上限、字幕长度、是否支持原声等）
  + last_check_at timestamptz

social_publish_jobs
  + kind text             -- 'video' | 'image_text'（替换原 kind 默认）
  + images text[]         -- 图文模式的图片 URL 列表
  + per_platform jsonb    -- 每平台独立标题/正文/话题/@/位置/合集，覆盖 job 主字段
  + retry_count int default 0

social_publish_targets
  + platform_post_id text -- 平台返回的作品 id（如有）
  + platform_post_url text
  + last_step text        -- 'uploading'|'submitting'|'reviewing'
  + worker_task_id text   -- worker 侧 task id
  + retry_count int default 0
```

新增 `social_platform_specs`（只读配置表，Edge Function 也读它）：平台 → 字幕字符上限、话题数、图片张数上下限、视频时长上下限、是否支持定时、是否需要封面。

## 3. SAU worker 协议对齐

按 SAU 上游官方接口重写 `supabase/functions/_shared/sau.ts`：

- `POST /login` SSE：返回 `step: qr|scanned|confirmed|success|fail` + 二维码 base64
- `GET /getValidAccounts` 替代以前的 `/getAccounts`
- `POST /upload` 支持图片 + 视频，返回 `{path, file_id}`
- `POST /postVideoBatch`、`POST /postImageBatch`（图文）
- `GET /getTaskStatus?task_id=` 查 worker 单任务进度
- 全部带 `X-Sau-Token`，错误统一 `{code, message}`

如果 worker 当前没有 `/postImageBatch` 或 `/getTaskStatus`，输出一份对接需求文档给服务器端 AI（`docs/social-auto-upload.md` v2）。

## 4. Edge Functions（全新命名）

| 函数 | 作用 |
| --- | --- |
| `dispatch-account-login` | SSE 反代 SAU `/login`，前端拿 step+二维码 |
| `dispatch-account-list` | 拉 `/getValidAccounts` + DB 合并，标"失效需重新登录" |
| `dispatch-account-revoke` | 删 worker cookie + 软删 DB |
| `dispatch-job-create` | 校验 specs（标题长度、图数、时长）→ 上传素材到 worker → 建 job/targets → 立即派单或留给 cron |
| `dispatch-job-status` | 聚合 targets + 拉 `/getTaskStatus` 刷新进度 |
| `dispatch-job-retry` | 重试单条 target |
| `dispatch-job-cancel` | 取消未派单的定时任务 |
| `dispatch-cron-tick` | pg_cron 每分钟调一次，派单到点任务 + 回收 30 分钟未回执的 running |

`dispatch-job-create` 关键逻辑：
- 视频走 `/postVideoBatch`、图文走 `/postImageBatch`
- `per_platform` 覆盖：每个平台用各自标题/话题（小红书话题用 `#xxx#`、抖音用 `#xxx`）
- 文件只上传到 worker 一次，多个账号复用同一个 `path`

## 5. 前端（嵌入营销中心）

营销中心首页（`MyMarketing.tsx`）新卡片入口「内容分发中心 ✈️」，进入 `/me/marketing/dispatch`，三个 Tab：

```text
┌──────────────────────────────────────────┐
│  发布工作台   │   发布历史   │   账号管理  │
└──────────────────────────────────────────┘
```

新页面：
- `src/pages/marketing/dispatch/DispatchHome.tsx` — Tab 容器
- `dispatch/Workbench.tsx` — 选素材（视频 / 图集）→ 选账号（按平台分组+多选）→ 每平台单独编辑标题/话题/封面 → 立即发 or 定时 → 提交后跳进度页
- `dispatch/JobDetail.tsx` — 单个 job 的实时进度（5s 轮询 + Realtime fallback）+ 平台返回链接 + 重试按钮
- `dispatch/History.tsx` — 列表，状态筛选（草稿/排队/进行中/部分成功/成功/失败/已取消），支持复制重发
- `dispatch/Accounts.tsx` — 卡片列表（头像+昵称+平台 logo+到期天数），右上「+ 添加账号」走扫码弹窗
- `dispatch/AddAccountDialog.tsx` — 选平台→拉起 SSE 显示二维码→扫码状态实时更新

新组件：
- `PlatformBadge.tsx` — 5 个平台彩色 logo（抖音黑、小红书红、视频号绿、快手橙、B站粉）
- `PlatformContentEditor.tsx` — 单平台文案/话题编辑，带字符上限提示，按 `social_platform_specs` 动态校验
- `AssetSelector.tsx` — 复用 `LibraryImagePickerDialog` 逻辑，加视频模式

从 `AssetDetailDialog.tsx` 的「一键发布」直接跳到 Workbench 并预选素材。

## 6. 验收

- 抖音/小红书/视频号/快手/B站 5 个平台都能扫码登录、出现在账号管理里
- 同一个视频可以一次勾 N 个账号（每平台单独写文案）一键发出，进度页能看到每个平台的最终链接
- 图文模式下小红书图集（1–9 张）能正常发，标题/正文/话题分平台
- 定时发布到点自动派单，可在历史里取消
- 任何一个 target 失败都给中文原因 + 重试按钮
- 旧 `/me/marketing/social-accounts`、`/publish-workbench`、`/publish-history` 路由 302 到新路径

## 7. 不在本期

- 直播预告 / 视频号动态
- TikTok（海外网络问题大，UI 隐藏）
- 数据回流（点赞/播放）— 留 v2

---

需要你确认两点再开做：
1. **图文模式优先级**：先把视频跑通再补图文，还是同期一起做？
2. **是否要我顺带输出一份给服务器端 AI 的接口需求清单**（`/postImageBatch`、`/getTaskStatus`、B站接入），方便你那边升级 worker？