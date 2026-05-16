## 目标
让「中古小精灵」头像继续以视频形式动起来，但彻底解决现在出现的黑底、闪烁、裁切/抖动和播放不稳定问题。

## 发现的问题
- 当前 `idle.webm` / `wave.webm` 虽然写入了 `ALPHA_MODE=1` 标签，但实际解码抽帧后 alpha 全部是 255，也就是没有真正透明通道，所以会出现黑色方块背景。
- 组件会在 `idle` / `hover` / `talking` 等状态间频繁切换视频源，视频会反复重载，从而造成头像位置和播放状态不稳定。
- 当前还有多层 CSS 动画叠加在视频动画上，容易放大“跳动/抖动”的感觉。

## 实施方案
1. **重新生成真正透明的视频资源**
   - 从已锁定的小精灵官方 PNG 生成新的视频帧。
   - 优先改用浏览器更稳定的透明视频格式组合：
     - `webm` 作为主资源；
     - 保留 APNG 作为透明 fallback；
     - 静态 PNG 作为最终兜底。
   - 生成后逐帧检查 alpha，不再只看 `ALPHA_MODE` 标签。

2. **稳定视频播放逻辑**
   - 调整 `SpiritMascot`：不让状态快速变化时反复销毁/重建 video。
   - 只在必要时切换到挥手动画；普通 idle/talking/thinking 统一保持稳定 idle 视频。
   - video 加载失败或透明表现异常时，自动降级到 APNG，不显示黑底。

3. **收敛肢体动效**
   - 保留“会动”的视频肢体效果：呼吸、轻摆、挥手。
   - 减少外层 CSS 的大幅度旋转/跳动，避免视频本身动效和 CSS 动效叠加导致不稳。
   - 小头像、聊天空状态、悬浮胶囊分别使用更合适的动效强度。

4. **验证**
   - 用 ffmpeg/Python 抽帧确认透明区域 alpha 正常。
   - 检查聊天面板里的 48px、120px、28px 三种尺寸，以及悬浮胶囊尺寸是否不再出现黑底或跳动。

## 预计改动文件
- `src/assets/spirit/idle.webm`
- `src/assets/spirit/wave.webm`
- `src/assets/spirit/idle-anim.png`
- `src/assets/spirit/wave-anim.png`
- `src/components/spirit/SpiritMascot.tsx`
- `src/index.css`