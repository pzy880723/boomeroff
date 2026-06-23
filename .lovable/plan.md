## 调整范围

前端排版/状态 + edge function 一处后处理，**不改数据库**。

---

## 1. 「惊喜一下」按钮重排版

当前问题:整块 primary 渐变 + 大图标，太重、太"广告位"，与首页其他卡片不一脉相承。

改为「年鉴卡片」语言:

- 容器:`bg-card` + `border-accent/30` + `shadow-sm`，左侧细古铜金竖线（`before:` 伪元素）作为强调,不再用大色块。
- 左侧:换成 `BOOMER` 头像（`boomer-idle.png`,40×40 圆角）取代 `Wand2`，呼应首页 Hero。
- 中部:
  - kicker：`font-display tracking-[0.18em] text-accent text-[10px]` → `惊喜 · SURPRISE`
  - 主标题 15px 半粗：`让 BOOMER 替你拍一条`
  - 描述 11px muted：`自动选品 · 写脚本 · 竖版 15 秒`
- 右侧:小胶囊 `9:16 · 15s`(accent 描边) + `ChevronRight`。
- hover/active：`border-accent/40` + `active:scale-[0.995]`。

若当前有进行中渲染任务（见 §3），右侧胶囊换为 `生成中…` + 旋转图标，点击直接展开既有任务弹窗。

---

## 2. 弹窗在 390px 上左右溢出

只改 `SurpriseVideoDialog.tsx`：

- `DialogContent` 改为 `w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[88vh] overflow-hidden flex flex-col p-0 rounded-2xl`。
- 全部 `px-5` → `px-4`，分镜卡 `gap-2.5` → `gap-2`，缩略图 `w-14 h-20` → `w-12 h-[68px]`，chip 行加 `flex-wrap min-w-0`。
- 顶部入选素材横滑行：`-mx-4 px-4 snap-x` 避免被 padding 截断。
- 分镜文本块 `min-w-0 break-words`，防长字幕撑宽。

目标：375px / 390px 屏幕左右各留 12px 安全距，不再贴边/溢出。

---

## 3. 关掉弹窗任务继续跑

当前两段会"丢"：

- **A 段（挑素材+写脚本 3–8s）**：关闭即组件卸载，再开重派一次。
- **B 段（已点"就拍这条"，渲染 1–2 分钟）**：`jobId` 只在组件 state，关闭即丢，下次打开看不到进度。

新增 `src/lib/surpriseJob.ts`（模块级 + `localStorage` 持久化）：

- 模块级 `inflightPick: Promise<SurpriseResult> | null` —— A 段去重。
- `getActiveRenderJob(shopId)` / `setActiveRenderJob(shopId, { jobId, cover_url, createdAt })` / `clearActiveRenderJob(shopId)`，`localStorage` key `boomer.surprise.job:<shopId>`，TTL 30 分钟自动清。
- `pollRenderJob(jobId)`：沿用现有 video 模块的 polling（读 `marketing_render_jobs` 状态或 `poll-marketing-video` edge fn，按现有惯例），返回 `queued|rendering|done|failed`。

`SurpriseVideoDialog` 行为变化:

1. 打开时先查 `getActiveRenderJob`:
   - 命中 → 进入「渲染进行中」视图：BOOMER + 进度文案 + 封面缩略 + 「去素材库」/「关闭(后台继续)」；启动 polling，done 时 `clearActiveRenderJob` + toast `🎬 视频拍好了`。
   - 未命中 → 走 A 段，但 `doPick` 改成复用 `inflightPick`，不重复派单。
2. 关闭弹窗：不取消 inflight、不清 jobId，仅隐藏 UI。
3. 「就拍这条」成功后：`setActiveRenderJob(shopId, ...)`，UI 切到「渲染进行中」。
4. `MyMarketing` mount 时读 `getActiveRenderJob`，给按钮加「生成中…」徽标，点击直接展开进行中弹窗。

边界：同一 shop 同时只允许一条 surprise 在跑，「换一组」只在 A 段可用。

---

## 4. 每一组镜头都不能重复（同一素材不被多个分镜复用）

当前 `generate-marketing-video-script` 可能给多个分镜分配同一个 `image_index`。改造放在 `surprise-marketing-video/index.ts` 内，**纯后处理 + 重采样**，不动脚本生成 fn：

1. **保证素材数 ≥ 分镜数**：脚本回来后，统计真实分镜数 `sceneCount = (hook?1:0) + scenes.length + (outro?1:0)`。若 `pickedAssets.length < sceneCount`：
   - 从剩余 pool（已剔除 `exclude` 和已选）继续 `sampleWeighted` 补齐到 `sceneCount`；
   - pool 也不够时，允许复用，但下一步会优先未用素材，再回退到"使用次数最少"的素材。
2. **强制一对一映射**（按分镜出场顺序遍历）：
   - 维护 `used: Set<number>` 和 `usage: number[]`（每个 asset 的已用次数）。
   - 对每个分镜：
     - 若模型给的 `image_index` 合法且未在 `used` 中，保留；
     - 否则在所有未用素材里挑：先按 `asset.summary/category/tags` 与该分镜文本（`scene/action/dialogue`）做朴素关键词重合度打分，分数最高的优先；并列时选 `usage` 最低的；再并列随机。
     - 选中后 `used.add(idx)`、`usage[idx]++`；写回 `clip.image_index = idx`。
   - pool 不足以一对一时（极端：素材数 < 分镜数且补齐也失败），从 `usage` 最低集合里挑——保证"分散度最大"，并在返回里加 `__warn: 'assets_reused'` 供前端可选提示。
3. **入选素材列表只展示真正用到的**：`assets` 数组按最终 `image_index` 出现顺序去重输出（保留 `index` 字段对齐分镜），未被任何分镜引用的素材剔除——前端"入选素材 · N 张实景"和分镜缩略图严格一致，不会出现"列了 5 张但只用了 3 张"或"同张图反复出现"。
4. 提交模式（`!preview && body.script && body.picked_assets`）也跑同样后处理：因为前端"就拍这条"会回传 preview 阶段的 script，本身已经处理过；但仍要做一次幂等校验，防止用户中途手改。

不动 `render-marketing-video`：它按 `image_index` 取图，前端展示和最终渲染天然一致。

---

## 验证

- 390×844：按钮新样式 + 弹窗左右各 12px 间距 + 缩略图横滑无截断。
- 进入弹窗 → 关闭 → 立刻重开：不出现重复 loading。
- 「就拍这条」→ 关闭 → 回 `/me/marketing`：按钮显示「生成中…」；再次点击直接看到进行中视图；done 后按钮恢复默认。
- 多次「换一组」：每组里所有分镜的缩略图互不重复，且入选素材数量 = 分镜数量。
- 极端：素材库只有 2 张图但脚本 4 个分镜 → 优雅降级 + 顶部出现轻量提示「素材偏少,已尽量打散」。
