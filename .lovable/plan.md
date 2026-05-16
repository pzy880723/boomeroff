## 目标
用户反馈问候弹窗里的小精灵还是太小，需要继续放大。

## 改动
仅改 `src/components/spirit/SpiritGreetingDialog.tsx`：

1. **外层容器尺寸**：`min(60vw, 220px)` → `min(86vw, 340px)`，让小精灵在手机上几乎占满宽度，视觉上真正"大大地浮在屏幕中央"。
2. **SpiritMascot size**：`Math.min(220, 60vw)` → `Math.min(340, Math.floor(window.innerWidth * 0.86))`，跟容器同步。
3. **地面柔光**：宽度从 `120%` → `130%`，高度 `32%` → `36%`，让大号小精灵的"落地感"更稳。
4. **气泡尾巴位置**：因为小精灵变大，云朵气泡顶部三角尾巴的 `-top` 偏移轻微下调（`-14px` → `-12px`），保持指向嘴部不脱节。
5. **气泡和按钮间距**：`marginTop: -6px` → `-2px`、按钮 `mt-6` → `mt-5`，整体收紧避免在小屏上被挤出视区。

不动 FloatingDashboard 的胶囊按钮（BTN=104 保持），只动问候弹窗内部尺寸。

## 技术细节
- `window.innerWidth` 已在原文件用过，保留同样的 SSR-safe 写法（组件只在 open=true 时挂载，不会在 SSR 触发）。
- 不引入新依赖，不改 CSS 动画关键帧。
