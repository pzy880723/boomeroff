# 排查结论

最近两条视频都是同一个原因失败：

- `aba94005…`（Pro / 1080p / 15s）06:34 提交，07:26 被标记"渲染超时(>10 分钟)"
- `2864c1db…`（Pro / 1080p / 15s）07:39 提交，07:50 被标记"渲染超时(>10 分钟)"

火山方舟那边任务还在 `running` 我们就把它判死了。Seedance **2.0 Pro** 跑 1080p / 15 秒经常要 12–20 分钟，而我们 `poll-marketing-video` 的 sweep 阈值只给了 **10 分钟**——所以只要选 Pro，基本必"超时失败"。上一条成功的视频用的是 Fast，3 分钟就好了，所以你之前没碰到。

# 修复方案（仅改 `supabase/functions/poll-marketing-video/index.ts`）

1. **按模型分级超时**
   - Fast / Mini：12 分钟
   - Pro 720p / 1080p：25 分钟
   - Pro 4K：35 分钟
   （根据 `marketing_assets.meta.model` + `meta.resolution` 取，取不到默认 25 分钟）

2. **超时前再确认一次** — 在 sweep 判定超时之前，先向 Ark 查一次该 `provider_task_id`：
   - 若 Ark 返回 `succeeded`，按正常流程写回 `video_url`，不再判失败。
   - 若 Ark 返回 `failed`，写真实错误（如方舟侧的"账号未激活/审核未过"）。
   - 仅当 Ark 仍是 `queued/running` 且已超阈值，才写"渲染超时"。

3. **错误文案带模型建议** — 真正判超时时，错误改成：  
   `"渲染超过 X 分钟未完成（{模型}/{分辨率}），建议改用 Seedance Fast 或降到 720p 重试"`。  
   现有 `VideoFailureCard` 已能识别"超时"关键字并给"降到 720p / 用 Fast 重试"按钮，无需前端改动。

4. **手动修复历史卡死的两条记录**：将 `2864c1db…`、`aba94005…` 的 `marketing_video_jobs.status` 和 `marketing_assets.meta.status` 仍是 `failed` 不动（已经写过了），但顺手再调一次 Ark 看是否其实已经成功——若成功就回填 `video_url`。

# 影响范围

- 仅修改 1 个 edge function（`poll-marketing-video`）。
- 前端无改动，沿用现有失败卡和重试按钮。
- 数据库无 schema 改动；仅在 sweep 流程内一次性补查两条历史记录。

# 验证

- 用 Pro / 1080p 重新生成一条 15s 视频，等待 15 分钟以内能拿到成功状态而不是被 sweep 杀掉。
- 用一个故意会失败的脚本，确认错误卡片里出现"用 Fast 重试 / 降到 720p"按钮。
