
## 问题诊断

### 一、为什么"秒针不动"

定位文件：`src/components/dashboard/LiveStreamPanel.tsx`（337-340 行）

```ts
const startTime = Date.now();
timerRef.current = setInterval(() => {
  setElapsedTime(Date.now() - startTime);
}, 100);
```

实际表现：进度数字常年停留在 `0.0s`，等 AI 返回后突然跳到 `2.7s`。

根因有两层：

1. **`setInterval` 在主线程繁忙时会被浏览器丢弃 tick**。识别流程紧接着会做：
   - `computeImageHash`（Canvas getImageData，同步约 10–60ms）
   - `JSON.stringify` 一张 1280px 的 base64 大图（500KB+ 字符串，同步约 30–80ms）
   - `supabase.functions.invoke` 内部还会再做一次序列化
   
   在 iOS Safari/微信内置浏览器，主线程被这些同步动作占住后，第一拍 `setInterval` 经常 1–3 秒后才触发。表现就是"秒针不走"。

2. **`setElapsedTime` 100ms 一次的 setState 在 React 18 下会被 concurrent batch 合并**，再叠加 `isRecognizing` 切换、overlay 进出动画的重渲染，视觉上更卡。

### 二、为什么"有时候识别失败"

定位文件：`supabase/functions/recognize-product/index.ts`（514 行）

```ts
const response = await callAIWithTimeout(imageList, recognitionPrompt, modelCfg, 8000);
```

主识别只给了 **8 秒**超时。Edge 日志显示一次正常调用就要 3.1 秒（`[Timing] mainAI: 3098 ms`），P95 经常会到 6–10 秒，尤其在：

- 弱网（店内 4G）上行 500KB base64
- Gemini gateway 偶发排队
- 多图（最多 5 张）模式

→ 触发 504，前端 toast"识别失败"。当前还**没有任何重试**，命中即失败。

另外 8 秒超时撞墙后，前端 `recognizeProduct` 会直接返回 `null`，但 `setRecognitionTime` 没设置，UI 只看到一个红色 toast，体感很糟。

---

## 修复方案

### A. 计时器改为 `requestAnimationFrame` + ref 驱动（前端）

文件：`src/components/dashboard/LiveStreamPanel.tsx`

- 用 `requestAnimationFrame` 取代 `setInterval`，不会被丢拍。
- elapsed 走 ref + 每帧 `setState`（最多 16ms 一次），切到后台自动暂停。
- 计时启动放在 `await computeImageHash` **之前**，保证从用户点"开始识别"那一刻就开始计数。
- 卸载/异常路径补 `cancelAnimationFrame`，避免泄漏。

### B. 主识别超时与重试加固（后端）

文件：`supabase/functions/recognize-product/index.ts`

- 超时从 **8s → 18s**（Gemini Flash Lite 视觉 P99 < 15s，留余量但仍远小于 Edge 150s 上限）。
- 加一次**自动重试**：仅对 504/5xx/网络错误重试 1 次，且第二次缩短 prompt + 关闭 google_search（如果当时开了）。
- 504 返回体新增 `retryable: true`，前端能识别。
- 日志补 `[Recognition] retry #1 because 504` 便于追因。

### C. 前端失败兜底（前端）

文件：`src/components/dashboard/LiveStreamPanel.tsx` + `src/hooks/useProductRecognition.tsx`

- 失败时仍 `setRecognitionTime(finalTime)`，并在结果区显示「识别超时，点这里重试」按钮，不再只弹 toast 就消失。
- toast 文案区分：超时 = "网络较慢，已自动重试一次仍未成功，请检查信号或换个角度重拍"；额度不足/格式异常分别提示。

### D.（可选）大图自适应压缩

文件：`src/components/recognition/CameraCapture.tsx`

当前固定 `1280px / 0.85`。建议：

- 若 base64 长度 > 600KB，二次压到 `1024px / 0.8`（瓷器底款这种细节场景仍清晰）。
- 这步能把弱网下的失败率再砍一半。

---

## 技术细节

| 项 | 现状 | 改后 |
|---|---|---|
| 前端计时器 | setInterval 100ms | requestAnimationFrame，每帧更新 |
| 计时启动点 | hash 计算之后 | 进入 handleRecognition 第一行 |
| Edge 主识别超时 | 8s | 18s |
| 重试 | 无 | 1 次（仅 504/5xx） |
| 失败 UI | 只有 toast | toast + 卡片内"重试"按钮 |
| 图片压缩 | 固定 1280/0.85 | 大于 600KB 再压一档 |

不改：模型选择、缓存逻辑、enrich-recognition、识别 schema、RLS。

## 影响范围

- 改 2 个前端文件 + 1 个 edge function
- 不动数据库、不动 enrich/community 流程
- enrich-recognition 已在后台跑，本次改动不影响

