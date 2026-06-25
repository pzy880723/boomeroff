## 目标
让「AI 自定义视频」和「BOOMER 帮你拍一条(惊喜一下)」在下次打开时,自动回填上一次选择的渲染模型(Pro/Fast/Mini)和分辨率,不用每次重选。

## 方案
新建一个轻量工具 `src/lib/videoModelPrefs.ts`,用 `localStorage` 存两个值:`lastModel`、`lastResolution`,并暴露 `getModelPrefs()` / `saveModelPrefs(model, resolution)` 两个方法。

### 接入点
1. **`src/pages/marketing/MarketingVideo.tsx`(AI 自定义视频)**
   - 初始化 `model`/`resolution` state 时读取 `getModelPrefs()` 作为默认值(没有则用现在的默认 Pro/1080p)。
   - 在用户切换模型或分辨率(`SeedanceModelPicker` 的 onChange)以及点击「开始渲染」时调用 `saveModelPrefs`。

2. **`src/components/marketing/SurpriseVideoDialog.tsx`(惊喜一下)**
   - 同样在打开弹窗 / 初始化模型选择 state 时读取上次选择。
   - 在 `SeedanceModelPicker` 的 onChange 与提交渲染时持久化。

3. **跨页一致**:两个入口共用同一份 key(`boomer:video:model_prefs`),所以在 A 页选了 Fast/720p,B 页打开也是 Fast/720p。

### 不动的部分
- 不修改 `SeedanceModelPicker` 组件本身,也不改后端。
- 不影响「修复建议」一键调整模型的逻辑(那次调整也会被保存为新偏好,符合"记住上一次")。
- 不持久化脚本、风格、片长这些每次会变的字段。

### 边界
- localStorage 读写都加 try/catch,SSR 或隐私模式下静默降级到原默认值。
- 如果存的模型 ID 在 `SeedanceModelPicker` 的可用列表里找不到(比如未来下线了某档),回落到 Pro/1080p。

完成后,关闭刷新再打开,模型胶囊和分辨率会直接显示你上次用的那一档。