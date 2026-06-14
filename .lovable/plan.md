## 问题
`src/components/voucher/QrScanner.tsx` 里取景框在手机上呈横向长方形，原因是 html5-qrcode 把摄像头视频按原生比例（一般 4:3 / 16:9）撑满容器，而我们没有强制容器尺寸；qrbox 虽然给了 260×260，但 video 是横的，扫描区域在视觉上也偏。

## 改动（仅 `src/components/voucher/QrScanner.tsx`）

1. **容器强制方形**：把 `#voucher-qr-reader` 改成固定方形——`w-[min(86vw,360px)] h-[min(86vw,360px)]`，去掉 `aspect-square + max-w-md`（在窄屏 + 高视口时 aspect-square 会被父级 flex 拉变形）。
2. **video 填充方式**：注入一段局部 CSS，让 html5-qrcode 生成的内部 `video` 用 `object-fit: cover; width:100%; height:100%`，并隐藏它自带的扫描线 UI 残留。
3. **qrbox 自适应**：把 `qrbox` 从写死的 260 改成回调形式 `qrbox: (vw, vh) => { const s = Math.floor(Math.min(vw, vh) * 0.75); return { width: s, height: s }; }`，保证不管视频是横是竖，扫描框都是居中正方形且足够大。
4. **加一个明显的方形描边**：在容器内部叠一个 `absolute inset-[8%] rounded-xl ring-2 ring-white/80` 的视觉框，提示用户对准位置。

不动 edge function、不动 `VoucherRedeem.tsx` 的调用方，不动其他扫码使用点。

## 技术细节
- html5-qrcode 的 `qrbox` 支持函数签名 `(viewfinderWidth, viewfinderHeight) => {width,height}`，取 `min` 的 75% 是社区常用安全值。
- `object-fit: cover` 会裁掉视频两侧/上下多余部分，让画面看起来就是正方形；扫描算法仍然在完整帧上做，识别率不受影响。
