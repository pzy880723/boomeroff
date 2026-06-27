
# 修复 Seedance Fast 在参考图模式下的 1080p 报错

## 根因

火山 doubao-seedance-2-0-fast **只支持 720p**（参考图/文本两种模式都不接受 1080p）。我们 `src/lib/seedanceModels.ts` 里给 Fast 写的是 `["720p", "1080p"]`，用户记忆里上次选的是 1080p，模型 picker 又会延用旧分辨率，于是命中 r2v + 1080p → 火山报 `resolution invalid for doubao-seedance-2-0-fast in r2v`。Mini 同源限制（厂商文档目前也只标 720p），按相同处理。

## 改动

### 1) `src/lib/seedanceModels.ts`
- Fast 的 `resolutions` 改为 `["720p"]`，`default_resolution` 维持 `"720p"`。
- Mini 同步改为 `["720p"]`，并在 `tagline`/`best_for` 文案上提示「仅 720p」。
- `reconcileResolution` 已经在分辨率不在新模型清单时回落到 `default_resolution`，所以一旦清单收紧，旧的 1080p 偏好会自动落回 720p——不需要改它。

### 2) `src/lib/videoModelPrefs.ts`（如果记忆函数会读取分辨率）
- 读分辨率偏好时套一层 `reconcileResolution(modelId, savedRes)`，避免把 localStorage 里旧的 1080p 直接喂给 Fast。如果文件里已经这么做了，跳过。

### 3) `supabase/functions/render-marketing-video/index.ts`
- `clampResolution`（已存在）依赖 `_shared/seedance-models.ts`。把那份 shared 文件里的 Fast / Mini 分辨率清单同步改成 `["720p"]`，让后端兜底（即便前端绕过 picker 直接发 1080p，后端也会自动降到 720p 并打 `resolution_downgraded` 标记）。
- 不动 `submitArkTask` 本身，依旧由 `clampResolution` 在调用前修正。

### 4) 前端 picker UI
- `SeedanceModelPicker.tsx`（已经基于 `resolutions` 数组渲染分辨率按钮）：清单变了之后，Fast 下只会显示「720p」一个选项，UI 自动收敛。

## 不动

- `submitArkTask` 的 r2v / t2v 分支、降级链、3 级安全降级、参考图上限 9 张、提示词、计费、UI 排版、播放/下载链路 → 都不动。
- 不改 Pro：Pro 维持 720p/1080p/4K 三档。

## 验收

- Fast / Mini 在 model picker 下只能选 720p，旧记忆中的 1080p 自动回落到 720p。
- 选 Fast + r2v 重新生成，不再触发火山 `resolution invalid` 错误。
- 若旧客户端仍传 1080p，后端 `clampResolution` 把它降到 720p，并在 `meta.warnings` 增加 `resolution_downgraded`。
