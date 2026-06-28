## 目标

把"目标时长"当成**软目标**而非硬约束。最终视频时长允许在用户选择附近浮动(±几秒),只要每一段都吸附到火山合法值就行,不再因为"切出来 11s/13s"而反复报错。

## 现状（已有但不够）

`supabase/functions/render-marketing-video/index.ts`:
- 已经有 `snapR2vDuration()`:r2v 模式下 ≤7s → 5s,>7s → 10s。
- 已经有 `clampDuration()`:把每段限制在 3–15s。
- 已经有 t2v(无参考图)模式不限制时长。

问题:
1. 切段时仍按"严格凑够 30s"的思路出现 11/13s 这种奇数段,雪花式地走到 `submitArkTask` 才被吸附 → 总时长漂得很难看,而且偶尔遇到极端段(比如 1.5s 兜底成 3s,被 r2v snap 到 5s)又凑不上。
2. 脚本生成端 (`generate-marketing-video-script`) 仍然强行把 `sum` 等比缩放回 `duration` 整数,导致每段秒数都是非 5/10 的奇怪值,后端再吸附就会"段段失真"。
3. 前端 UI 没告诉用户"实际成片会比 30s 略多/少"。

## 改动

### A. 后端 `supabase/functions/render-marketing-video/index.ts`

1. **新增 `snapShotsToValidGrid(shots, hasRefs)`**:在 `splitScript` 之后调用。
   - 如果 `hasRefs`(r2v):每段 `duration_s` 吸附到 {5, 10}(沿用现有 `snapR2vDuration`)。同时**合并相邻的小段**:连续两个被吸附成 5s 的段,如果加起来更接近 10s,合并为 1 段 10s(把后段的 scene/action/dialogue 顺接到前段的备注里;仅当合并后总段数 ≥1 且不让总时长偏离目标 >30%)。
   - 如果 t2v:每段保持 `clampDuration`(3–15s),不做硬吸附。
2. **`one_shot` 路径**:`oneShotDur` 改为"目标时长按 r2v 网格吸附"(≤7→5, ≤12→10, >12→15)。同样不再死磕用户选的具体秒数。
3. **响应里多回传一个字段** `actual_duration_s`(各段 effectiveDuration 之和),便于前端展示"实际约 N 秒"。
4. **日志**:打印 `[render] target=30 actual=30 segs=3×10` 这种摘要,方便排查。

### B. 后端 `supabase/functions/generate-marketing-video-script/index.ts`

- 删掉最后的"等比缩放回 duration"那段(`if (Math.abs(sum - duration) > 0.5)`)。改为:对每个分镜的 `duration_s` 做"软建议"——只 `clamp` 到 [perClipMin, perClipMax] 内,不再强求总和精确等于 `duration`。
- 在 system prompt 里把"所有镜头 duration_s 之和必须 ≈ ${duration} 秒"改成"≈ ${duration} 秒,允许 ±20% 浮动,最终以渲染端为准"。

### C. 前端 `src/pages/marketing/MarketingVideo.tsx`

- 时长选择器下方那行小灰字补一句:
  > 实际成片会在所选时长附近浮动几秒(火山视频模型按 5/10 秒为单位渲染)。
- 渲染任务返回 `actual_duration_s` 时,在任务卡上展示「目标 30s · 实际约 30s」。

### D. 前端 `src/lib/videoFailure.ts`

- 保留现有的 `duration ... not valid for ... r2v` 中文映射,但同时把"自动改 10 秒分段重试"的修复改成兜底——因为正常路径已经不再触发这条错误。

## 不动

- t2v(无参考图)的时长逻辑保持现状。
- 角色板、Lightbox、风格选择、所有上游逻辑都不动。
- 不改数据库 schema,只是新增 meta 字段写入。

## 验证

1. 选 30s + 带参考图 → 日志显示 `target=30 actual=30 segs=3×10`,无 duration 报错。
2. 选 20s + 带参考图 → `segs=2×10`,实际 20s。
3. 选 45s + 带参考图 → `segs=4×10 + 1×5` 或 `5×10`,实际 45–50s,前端展示"目标 45s · 实际约 50s"。
4. 选 15s 无参考图 → t2v 单段直出,行为不变。

涉及文件:
- `supabase/functions/render-marketing-video/index.ts`
- `supabase/functions/generate-marketing-video-script/index.ts`
- `src/pages/marketing/MarketingVideo.tsx`
- `src/lib/videoFailure.ts`
