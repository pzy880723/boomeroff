
## 改造目标

把"Boomer 帮我拍 / 惊喜一下 / 自定义视频"全部改成 **逐镜渲染 + 拼接**，删除"整段直出"路径。每个分镜都用自己的分镜静帧作 `first_frame` 单独喂给 Seedance，让脚本里的每一镜真正出现在最终视频里。

## 改造范围

### 1. `supabase/functions/render-marketing-video/index.ts`（核心）

- **删除** `if (totalDur <= MAX_SEG_DUR)` 单段分支（约第 363–457 行）
- **统一走多段路径**，但切分策略改成：**每个分镜 = 1 段**，而不是按 15s 时长贪心打包
  - 输入：`script.subtitles[]` (hook / main[] / outro)
  - 输出：`subScripts.length === 分镜数`，每段 `total_duration_s = 该镜 duration_s`（向上取整到 Seedance 允许的最小 3s，单段上限 15s）
- 每段提交参数：
  - `first_frame` = 该镜的 `storyboard_url`（静帧）
  - `reference_image` = 角色头像（最多 4 张）
  - `prompt` = 该镜的 `scene + action + subtitle`（不再把所有镜头拼成长 prompt）
  - 不再使用 `last_frame`（除非该镜本身指定了尾帧）
- 保留已有的：
  - 父任务 + 子任务（`segment_index` / `parent_job_id`）表结构
  - 并行提交 + 敏感内容 3 级降级链
  - `EdgeRuntime.waitUntil` 后台提交
- `marketing_assets` 占位行的 `segment_total` 改为分镜数

### 2. `supabase/functions/poll-marketing-video/index.ts`

- 确认轮询逻辑能处理"N 段子任务全部 succeeded → 触发拼接"——目前已实现，但需要把"拼接阈值"从原来的"多段才拼"统一成"≥2 段就拼，=1 段直接产出"
- 拼接走现有 `stitchVideos.ts`（ffmpeg-wasm，时间戳对齐）

### 3. `supabase/functions/surprise-marketing-video/index.ts`

- 无需新增参数，因为后端默认就是逐镜模式
- 确保生成的脚本分镜数合理（建议 15s ≈ 3–4 镜，避免单镜 <3s 被强行拉到 3s 浪费）

### 4. `src/lib/marketingSegments.ts` + `supabase/functions/_shared/marketing-segments.ts`

- `planSegments()` 改为 **直接返回每个分镜作为一段**，废弃"按 15s 等分"算法
- 前端预览段数 = 分镜数，每段时长 = 分镜时长

### 5. `src/pages/marketing/MarketingVideo.tsx` + `SurpriseVideoDialog.tsx`

- UI 文案更新：
  - "分段预览"折叠卡：`共 N 段（每段对应 1 个分镜，独立渲染后自动拼接）`
  - 进度卡：`渲染中 X/N 镜` + 当前镜次缩略图
  - 移除任何"整段直出"相关 hint
- **不新增**任何模式切换开关

### 6. 兼容与回滚

- `render_mode` 字段保留为 meta 注释字段（值固定 `per_shot`），方便未来排查
- 数据库无需迁移（沿用 `marketing_video_jobs` 父子结构）

## 关键技术细节

- **Seedance 最短单段 = 3s**：分镜 <3s 时拉到 3s（按秒计费会略增一点点，但保证语义完整）
- **Seedance 单段上限 = 15s**：单个分镜不可能超过 15s（脚本生成阶段已约束），无需再切
- **拼接顺序**：按 `segment_index` 升序拼接，hook → main[0..n] → outro
- **失败兜底**：某镜 3 级降级仍失败 → 用该镜静帧合成 3s 静态片段（ffmpeg-wasm 实现）参与拼接，避免整条作废
- **封面**：拼接后取第 1 段首帧作 `meta.cover_url`（已存在逻辑）

## 用户感知的变化

- ✅ 每个分镜的静帧都会出现在最终视频里（之前只有第 1 张）
- ✅ 脚本里写的每一镜真正落地
- ⏱ 渲染时间从 ~60s 变成 ~90–120s（多段并行提交 + 拼接 ~10s）
- 💴 费用基本持平（Seedance 按秒计费，每段最短 3s 会有小幅上浮，但角色一致性、画面贴合度都提升）

## 不动的部分

- 模型/分辨率/画风选择
- 角色认证 / `asset://` 协议
- 素材库、文案生成、下载、分发
- 计费方式（仍是火山按秒计）
