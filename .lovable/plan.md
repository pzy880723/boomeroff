## 问题定位

1. **静帧泛黄**:`supabase/functions/storyboard-marketing-video/index.ts` 写死了「室内暖色调」+「与其他分镜色调/光线保持一致」,等同于给所有图加暖黄滤镜。
2. **灯箱滑不动**:`src/components/voucher/ImageLightbox.tsx` 只接了按钮和键盘事件,没有 touch 手势。
3. **点灯箱关闭按钮 = 退出整个 Surprise 弹窗回到营销首页**:`ImageLightbox` portal 到 `document.body`,在 React 树里仍属于 Radix `Dialog` 的子节点;Radix 通过监听全局 `pointerdown` 判断"DialogContent 外的点击 = 关闭弹窗"。灯箱真实 DOM 在 Dialog 之外,所以点灯箱关闭 X / 蒙层任意位置 → 父 Surprise Dialog 也被一并关掉。

## 改动

### 1. 静帧去滤镜(`supabase/functions/storyboard-marketing-video/index.ts`)

`buildFramePrompt`:
- 删掉「**室内暖色调**」的字样,改为中性写实:`真实店内自然光,白平衡准确,色彩干净不偏色,无滤镜、无暖黄/复古调色`。
- 删掉「与其他分镜色调/光线保持一致」,保留「构图/角色身份一致」即可,避免模型互相对齐到偏黄。
- 在「严禁」一行追加:`严禁加滤镜、暖黄调色、复古褪色、绿青色偏、HDR 过曝`。

### 2. 灯箱支持滑动(`src/components/voucher/ImageLightbox.tsx`)

- 加 `onTouchStart` / `onTouchEnd` 记录手指起点和终点 X;水平位移 > 50px 时切换上下张(向左滑 = 下一张)。
- 加 `onWheel` 适配触控板横向滚动。
- 阻止图片本身的 touch 冒泡,避免误触发关闭。

### 3. 灯箱不再误关父 Dialog(`src/components/voucher/ImageLightbox.tsx`)

灯箱根节点上拦截会冒泡到 Radix 的指针事件,让父 Dialog 检测不到「外部点击」:

```tsx
const stopPointer = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => e.stopPropagation();

<div
  onPointerDown={stopPointer}
  onPointerUp={stopPointer}
  onMouseDown={stopPointer}
  onTouchStart={...combined}
  ...
>
```

Radix 的 `onPointerDownOutside` 在 capture 阶段读 `event.target`,但 Lovable 项目里同类灯箱已采用「在 portal 根节点 stopPropagation pointerdown」就能阻止 Radix 误判;若仍不够,使用 `event.stopImmediatePropagation` 的原生监听补一道保险:`useEffect` 给根 div 绑定 `pointerdown` capture 监听并 `stopPropagation`。

同时给 portal 根节点加 `data-lightbox-root`,方便排查。

## 验收

- 重新点惊喜一下,生成的分镜静帧不再普遍偏黄,色彩接近实拍。
- 手机上点缩略图打开灯箱后,左右滑动能切上下张,1/N 计数同步。
- 点灯箱右上角 X 或蒙层关闭 = 只关灯箱,Surprise 弹窗保持打开。
