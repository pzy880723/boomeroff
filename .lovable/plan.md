# 修复定向发放海报二维码生产环境消失的问题

## 病因(为什么部署后二维码就没了)

`src/pages/VoucherSharePoster.tsx` 实际显示给店员的"海报"**不是 DOM 海报本身**,而是一张用 `html-to-image.toPng()` 截图得到的 PNG (`imgDataUrl`)。流程是:

```text
读 claim/voucher → 渲染隐藏的 <VoucherPoster>(里面有 <QrCanvas>)
                ↓
        setTimeout 250ms
                ↓
       toPng() 截图 → setImgDataUrl → 页面 <img src={imgDataUrl}>
```

`QrCanvas` 内部用 `QRCode.toCanvas(canvasEl, value, …)` **异步**把二维码画到 `<canvas>`。这个 promise 解决时间取决于:
- `qrcode` 这个 chunk 在生产环境是按需懒加载的,首次进入海报页要去 CDN 下载/解析/执行
- React 渲染、canvas getContext、二维码计算

**开发环境**:本地热模块、qrcode 早已在内存 → 通常 30–80ms 内画完,250ms 兜底足够。
**腾讯云生产环境**:首次进入 + 远端 CDN 拉 chunk + 真机 CPU 慢一点 → 经常 250ms 还没画完,这时 `toPng` 截到的是一张**空白 canvas**,导出的 PNG 上二维码那块就是一个白方块。链接还能复制、长链短链都没问题,所以"只能通过链接进去"。

二级原因:`toPng` 的 `cacheBust: true` 会强制重新拉取所有图片资源,生产环境网络慢一拍会再放大这个 race。

## 修复方案

抛弃"靠 setTimeout 等 canvas 画完"的隐式时序,改成**先把二维码生成成 data URL,确认 ready 之后再触发截图**。整体思路对齐项目里已经稳定工作的 `ActivityShareDialog.tsx`(它就是用 `QRCode.toDataURL` + `<img>` 渲染的)。

### 改动 1:海报二维码改用 `<img src={dataUrl}>` 而不是 `<canvas>`

- `src/components/voucher/VoucherPoster.tsx`
  - props 增加 `qrDataUrl?: string`(可选,向后兼容)。
  - 二维码槽位:有 `qrDataUrl` 就用 `<img src={qrDataUrl} width={120} height={120} alt="" />`;没有就显示占位"二维码生成中…",**不再**直接挂 `<QrCanvas>`。
  - 这样 html-to-image 截图时面对的是一个已经就绪的 `<img>` 元素(data URL,同步可读),没有 canvas 异步时序问题。

- `src/components/voucher/QrCanvas.tsx`:暂时保留(其他地方还在用 / 也可以留作 fallback),不动。

### 改动 2:海报页面先生成 qrDataUrl,再触发截图

- `src/pages/VoucherSharePoster.tsx`
  - 增加 `const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)`。
  - 拿到 `shareUrl` 后:
    ```ts
    const url = await QRCode.toDataURL(shareUrl, {
      width: 240, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    setQrDataUrl(url);
    ```
  - `renderImg`(toPng)的 useEffect 依赖改成 `loading, claim, voucher, qrDataUrl` 全部 ready 才跑;`setTimeout` 缩到 50ms 仅仅做一帧让 React commit。
  - 给 `<VoucherPoster>` 传 `qrDataUrl={qrDataUrl}`。
  - `toPng` 调用去掉 `cacheBust: true`(纯 data URL 资源不需要 bust)。

### 改动 3:加一次失败重试 + 简单的可见性兜底(防御性)

- 如果 `toPng` 截图后**结果异常**(比如尺寸为 0、或抛错),展示一个"重新生成"按钮(已存在 Download/返回 按钮区域,加一个),点了重跑 `renderImg`,顺便重新 `QRCode.toDataURL`。
- 同时把"分享短链"区域的"复制"按钮保留(已存在),即使万一未来还出问题,店员仍然能拿到链接发出去。

## 不动的范围

- 二维码内容 / `buildClaimShareUrl` / 短链生成 / 后端 edge function:全部不动 — 二维码的"值"本来就是稳定的,问题只出在前端渲染时序。
- 海报视觉(颜色、字号、布局)不动。
- `ActivityShareDialog` 不动(它已经用正确写法)。

## 验收

- 全新设备首次访问海报页面(模拟"刚部署完、CDN 冷启动"):看到的海报上二维码正常,可识别跳转到领取页。
- 下载下来的 PNG 二维码清晰、可被微信/相机扫描。
- 反复刷新海报页面 5+ 次,二维码 0 次缺失。
- 网络限速到 Slow 3G 也能正常出二维码(只是出图慢一点,不会出现"空白二维码")。