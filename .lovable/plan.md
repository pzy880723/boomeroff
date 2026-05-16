## 诊断
现在 `idle.webm` / `wave.webm` 的像素格式是 `yuv420p`（VP9 Profile 0，**无 alpha 通道**），所以视频是带不透明背景的方块。叠在小精灵浮窗 / 抽屉的深色背景上就会出现"头被切掉/糊一块"的观感——这就是你看到不对劲的根源。

之前为了规避"白底 chromakey 误伤脸"的问题，我用 Python 从 PNG 渲染帧再合成 WebM，但导出时 alpha 通道被压成不透明黑底了。

## 修复方案

### 1. 用真正的 alpha WebM 重新生成两段动画
- Python（Pillow）从 `src/assets/spirit-mascot.png`（带完整 alpha）渲染 PNG 序列，对每一帧做平移 / 缩放 / 微旋转，alpha 全程保留。
  - `idle.webm`：呼吸 + 漂浮 + 轻摆，~3 秒、24fps 循环
  - `wave.webm`：身体微点头 + 招手摆动 + 小跳，~2 秒、24fps 循环
- 用 ffmpeg `libvpx-vp9` 编码：
  - `-pix_fmt yuva420p`（带 alpha 的 VP9 Profile 0）
  - `-metadata:s:v:0 alpha_mode=1`
  - `-auto-alt-ref 0`（VP9 alpha 必须）
  - `-b:v 0 -crf 30`，体积控制在 ~200KB 以内

### 2. 同步刷新 APNG 兜底
用同一批帧再生成 12fps 的 `idle-anim.png` / `wave-anim.png`，保证 Safari/旧浏览器掉到 APNG 时观感一致、也是透明背景。

### 3. 浏览器内 QA（必须）
- `ffprobe` 确认两个 WebM 都是 `yuva420p` + `alpha_mode=1`。
- 用 ffmpeg `alphaextract` 把 alpha 通道单独导出，肉眼检查脸、围巾、相机、手都在；背景完全透明。
- 在浮窗深色背景下截图，检查没有黑色方块边缘。

### 4. 前端只做最小调整
`SpiritMascot.tsx` 的三级回退（webm → apng → 静态 png）逻辑保留不动，只是：
- 视频已经带正确 alpha，不会再被误判，3 秒超时兜底的逻辑保留。
- `wave` 状态由 hover / alert / talking 触发，保持现在的映射。

## 涉及文件
- `src/assets/spirit/idle.webm`（重新生成，带 alpha）
- `src/assets/spirit/wave.webm`（重新生成，带 alpha）
- `src/assets/spirit/idle-anim.png`（重新生成）
- `src/assets/spirit/wave-anim.png`（重新生成）
- `src/components/spirit/SpiritMascot.tsx`（如有必要的小调整）

不动 `mem://design/spirit-mascot-canonical` 约定的官方形象，只是给它加动作。

确认后我就开始执行并在生成后做帧检验，确保脸、围巾、相机都完整再交付。