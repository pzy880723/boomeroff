## 问题诊断

在 `src/pages/ActivityDetail.tsx` 第 45-50 行,点击「查看截图」时:

1. **要先 await `createSignedUrl` 才打开 Lightbox** — 国内访问 Supabase 签名接口一次往返通常 300-1000ms,期间按钮无任何反馈,看起来像「卡死」。
2. **每次点击重新签名** — 同一张图反复点也要重新请求一次。
3. **直接加载原图** — 实测库里多为 150-270KB JPEG,虽然不算大,但 Lightbox 打开后还要再走一次 TOS 下载,首屏没有占位/进度指示。

bucket 是 private,所以必须走 signed URL,但完全可以提前批量签好。

## 改造方案(只动 `ActivityDetail.tsx`)

### 1. 一次性批量预签所有截图 URL

`load()` 拿到 `apps` 后,扫描 `activity.form_fields` 中 `type === 'image'` 的字段,收集所有 path,用 `supabase.storage.from('voucher-screenshots').createSignedUrls(paths, 3600)` 一次性签 1 小时。结果存在 `signedUrlMap: Record<path, url>` state。

### 2. 点击「查看截图」即时打开

`openImage(path)` 改为:
- 命中缓存 → 立即 `setLightbox`,0 延迟。
- 未命中(极少数,新申请的兜底) → 立刻打开 Lightbox 显示 loading,再异步签名后回填。

### 3. Lightbox 加载占位

给 `ImageLightbox` 内部 `<img>` 增加 `onLoad`/`onError`,加载中显示一个小 spinner(改 `src/components/voucher/ImageLightbox.tsx`,只加占位层,不动手势/键盘逻辑)。

### 4. 缩略图加速首屏(可选保险)

在请求图片时拼接 Supabase storage `transform` 参数(`?width=800&quality=75`),把渲染体积降到 ~50KB。注意 `createSignedUrl` 第三参数支持 `transform`,改成:

```ts
createSignedUrls(paths, 3600, { transform: { width: 1080, quality: 80 } })
```

(`createSignedUrls` 不支持 transform 时,降级为对每条 URL 追加 `&width=1080&quality=80`。)

## 涉及文件

- `src/pages/ActivityDetail.tsx` — 新增 `signedUrlMap` state、预签逻辑、改写 `openImage`。
- `src/components/voucher/ImageLightbox.tsx` — 增加图片加载中的 spinner 占位。

## 预期效果

- 首次进入页面后,点「查看截图」**0 延迟**打开。
- 1 小时内重复查看不再请求签名接口。
- 图片首屏体积下降 ~70%,Lightbox 内有明确加载反馈,不再有「点了没反应」的感觉。
