## 目标
缩短 `SpiritGreetingDialog` 中大号小精灵和下方云朵气泡之间的垂直空隙，让它们看起来像是真的在"说话"。

## 改动
文件：`src/components/spirit/SpiritGreetingDialog.tsx`

1. 小精灵容器（`.spirit-greet-mascot`）目前 `width/height = min(86vw, 340px)`，但 mascot 图本身在容器内底部对齐，下方仍有视觉空白。
   - 在 mascot wrapper 上加 `mb-[-48px]`（或在云朵气泡的 wrapper 上加 `mt-[-40px]`，覆盖现有 `marginTop: -2px`），把气泡往上拉 ~40-48px。
2. 同步调整云朵尾巴 `-top-[12px]`，必要时改成 `-top-[10px]`，保持尾巴贴着气泡顶部不变形。
3. 不动按钮位置（`mt-5`），保持气泡与按钮间距。

## 验证
- 移动端 390 宽视口下，mascot 嘴部与气泡尾巴目测衔接。
- 不溢出屏幕、按钮不被遮挡。

## 不在范围
- 浮窗胶囊、抽屉、其它 spirit 组件均不动。