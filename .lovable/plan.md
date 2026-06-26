## 现状诊断

数据库里只有 **1 个** 真正卡着的任务：

| ID | 状态 | 创建时间 | 最近轮询 | provider_task_id |
|---|---|---|---|---|
| `aba94005…b39b2d` | `running` | 06:34 UTC | 07:21 UTC | `cgt-20260626143435-5lkbv` |

其它历史任务都已经是 `succeeded` 或 `failed`。这一个已经"渲染"了 50 分钟，明显异常。

## 真正的根因

1. **没有后端轮询 cron**：现在数据库里只配了 `kb-ingest` 和 `social-publish-dispatch` 两个 cron 任务，**没有** 给 `poll-marketing-video` 配定时器。这意味着只有你打开「惊喜一下」弹窗 / 视频详情页时，前端 setInterval 才会去查 Seedance；一旦你切到别的页面或后台被回收，这个任务就被"遗忘"了。
2. 火山 Seedance 单次任务正常应在 1-5 分钟出结果。超过 10 分钟还 `running` 基本就是火山侧排队/掉队/失败但 webhook 没通知。
3. 现在的"24 小时自动清理"阈值太宽，用户体感是"永远在转"。

## 修复计划

### A. 立刻把这一个任务推动一下
- 用 service role 调一次 `poll-marketing-video`，强制查火山现状；如果返回 `failed/expired`，直接落库，前端就能看到"失败 + 重试"卡片。
- 如果火山仍然 `running` 但已超 10 分钟，把它标成 `failed` 并写明 `error = "渲染超时，请重试"`，让 `VideoFailureCard` 给出重试按钮。

### B. 加后端 cron，杜绝"被遗忘"
新增 pg_cron 任务 `poll-marketing-video-every-min`：

```text
每分钟 → POST /functions/v1/poll-marketing-video?mode=sweep
```

`poll-marketing-video` 增加一个 sweep 分支（service role 调用时）：

1. `select * from marketing_video_jobs where status in ('queued','running') and created_at > now()-interval '1 hour' limit 20`
2. 对每条调 `pollOne()`，按返回状态回写。
3. 单条任务若 `created_at < now() - interval '10 min'` 且仍 `running` → 标 `failed`，`error = "渲染超时，已自动结束"`。

这样不管前端有没有开着，状态都会自己往前走。

### C. 前端体感优化（小改动）
- 卡片显示「已渲染 X 分钟，超过 8 分钟仍未完成可点重试」。
- 超时后展示 `VideoFailureCard` 的「降到 720p / 换 Fast 模型」修复按钮（这套逻辑已经有，只是没在超时场景触发）。

## 涉及文件

```text
supabase/functions/poll-marketing-video/index.ts   # 加 sweep 分支 + 超时判定
src/components/marketing/SurpriseVideoDialog.tsx   # 渲染时长提示
src/components/marketing/VideoFailureCard.tsx      # 复用现有按钮
+ 一条 cron.schedule SQL（用 supabase--insert 写入，不走 migration）
```

## 你需要回答我的两个问题

1. **超时阈值定多少？** 我建议 **10 分钟** 兜底（Seedance Pro 平均 2-4 分钟）。如果你常跑 4K 长片可以放到 15 分钟。
2. **要不要顺手把 `aba94005` 这一条直接标 failed？** 还是先让 sweep 来跑一次再说？

确认后我去 build 模式落地。
