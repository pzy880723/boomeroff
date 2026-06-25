## 目标
在「惊喜一下」和「AI 自定义视频」两处的 Seedance 渲染模型选择旁，新增分辨率选择（720p / 1080p / 4K），按模型能力灰化不支持档位，并贯通到后端渲染。

## 模型能力矩阵（前端枚举）
- **Pro**：720p / 1080p / 4K，默认 1080p
- **Fast**：720p / 1080p（4K 灰化，提示「Fast 不支持 4K，请切换 Pro」），默认 720p
- **Mini**：720p / 1080p（4K 灰化），默认 720p

切换模型时：若当前分辨率不在新模型能力内，自动回落到该模型默认档，并 Toast 提示。

## 改动点

### 1. `src/components/marketing/SeedanceModelPicker.tsx`
- 在折叠胶囊摘要中追加「· 1080p」之类的当前分辨率标签。
- 在 Popover 内每张模型卡片下方新增一行「分辨率」三按钮组（720p / 1080p / 4K），不支持的档显示为 disabled + tooltip。
- 新增 props：`resolution`, `onResolutionChange`，并导出 `MODEL_RESOLUTIONS` 常量供后端参数构造与文案复用。

### 2. `SurpriseVideoDialog.tsx`（惊喜一下）
- 维持 `selectedModelId` state，旁边新增 `selectedResolution` state，默认随模型推荐值。
- 切模型时按能力矩阵 reconcile 分辨率。
- 「就拍这条」按钮文案补上分辨率：例如「用 Pro · 1080p 开始渲染」。
- 调 `render-marketing-video` / `surprise-marketing-video` 时透传 `resolution`。

### 3. `MarketingVideo.tsx`（AI 自定义视频）
- 在「05 渲染模型」区块下方加「分辨率」一行（复用 Picker 内的按钮组件或同款 UI）。
- 任务入队、渲染进度卡中的当前模型展示同时显示分辨率徽标。

### 4. 后端
- `supabase/functions/render-marketing-video/index.ts`：
  - 读取请求参数中的 `resolution`（合法值 `720p|1080p|4k`）。
  - 与模型能力矩阵交叉校验，非法时返回 422 并附 `allowed`。
  - 将该值映射成火山方舟 Seedance API 的 `resolution`/`size` 参数（替代当前根据模型自动降级的硬编码逻辑；Pro 仍允许 4K）。
- `supabase/functions/surprise-marketing-video/index.ts`：透传 `resolution` 给 render 调用。
- `marketing_video_jobs` 表写入 `metadata.resolution` 便于历史回看（不需要新字段，复用现有 jsonb metadata）。

### 5. 共享常量
- 新建 `src/lib/marketing/seedanceModels.ts`（若已有则扩展），导出 `MODEL_RESOLUTIONS`、`DEFAULT_RESOLUTION_BY_MODEL`、`reconcileResolution(modelId, current)`，前后端各自 import（后端复制一份到 functions 目录的本地工具文件以避免跨目录 import）。

## 验收
- 切 Pro → 4K 可选；切 Fast 后 4K 自动回退到 720p 并 Toast。
- 惊喜一下与自定义视频的渲染进度卡都显示「模型 + 分辨率」。
- 后端日志中 `resolution` 字段与前端选择一致；非法组合被拒并提示。
