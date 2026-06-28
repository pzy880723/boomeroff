
# 修复"duration not valid for r2v"报错 + 中文化提示

## 根因（两个一起出错）

1. **真正的 API 错误**：Seedance 2.0 在 **r2v（reference-to-video，带参考图的模式）** 下，只接受**固定几个时长**（通常是 5 / 10 秒），不接受 3、4、7、8、11、12、13、14、15 这种任意秒数。我们之前把 UI 时长选项扩到 `[15, 20, 30, 45, 60]`，分段时一段会被切成奇数秒（比如 60s ÷ 4 = 15s 但段间余数会出现 11/13s），加上又带了参考图 → 火山方舟直接拒收。
2. **错误提示没翻译**：`videoFailure.ts` 里没有 `duration ... not valid` 这条映射，于是 toast 直接把英文原文丢给用户。

## 修复方案（两层一起做）

### Layer 1 — 后端：在 r2v 模式下把 duration 吸附到合法值

文件 `supabase/functions/render-marketing-video/index.ts`：

- 新增常量 `R2V_VALID_DURATIONS = [5, 10]`（Seedance 2.0 reference-to-video 唯一合法值，t2v 不受限）。
- 新增 `snapR2vDuration(d)` 工具：把任意秒数吸附到 `[5, 10]` 中**最接近且不超过**的值（≤7 → 5；>7 → 10）。
- 在 `submitArkTask` 真正发起请求前，如果 `referenceImages?.length > 0`（即走 r2v 通道）：把 `duration` 经过 `snapR2vDuration` 处理。
- 同步修改切段逻辑：当用户选 30 / 45 / 60 秒**且有参考图**时，按 10 秒分段（30→3 段、45→4 段最后段 5s、60→6 段）。`text2video`（无参考图）保持现状不变。

### Layer 2 — 前端：错误中文化 + 自动降级

文件 `src/lib/videoFailure.ts`：

- 新增匹配模式：
  ```ts
  /the parameter duration .* is not valid for model.*r2v/i
  ```
- 中文文案：
  > **时长不被参考图模式支持**
  > 当前模型在带参考图渲染时只支持 5 秒或 10 秒。系统会自动按 10 秒分段重试，您也可以减少参考图或缩短总时长。
- 自动修复按钮：「**改为 10 秒分段重试**」（`patch: { autoSegmentR2v: true }, reRender: true`）。

文件 `src/lib/toastVideoFailure.ts` 不用动（它读 videoFailure 映射）。

### Layer 3 — UI 提示

文件 `src/pages/marketing/MarketingVideo.tsx`：

- 在视频时长选择器旁加一行小灰字：
  > 选 30 秒以上 + 带参考图时，会自动按 10 秒分段，画面之间会有切换感。
- 仅当用户已选角色（有参考图）且时长 ≥ 30s 时显示。

## 不动的部分

- 单段（15s 以内）+ 无参考图 → 行为完全不变。
- 角色板、Lightbox、风格选择、所有上游逻辑都不动。
- 不改数据库、不改 Edge Function 部署清单。

## 验证

1. 选 60s + 带参考图 → 重新渲染，确认后端切成 6×10s 且不再报 duration 错。
2. 故意构造一次老 60s + 11s 段的请求，触发报错 → 确认 toast 显示新的中文文案 + 「改为 10 秒分段重试」按钮可点。
3. 选 15s + 无参考图（text2video） → 行为不变。

涉及文件：
- `supabase/functions/render-marketing-video/index.ts`
- `src/lib/videoFailure.ts`
- `src/pages/marketing/MarketingVideo.tsx`

请确认是否按此方案落地。
