# 修复桌面图标和 App 名称显示

## 问题诊断

你看到的灰色「中」字图标 + 被截断的「中古商品实时识…」名称，原因是：

1. **缺少 Web App Manifest**（`manifest.json`）  
   Chrome 添加到主屏幕时，会优先读 manifest 里的 `name` / `short_name` / `icons`。当前项目没有这个文件，所以浏览器只能 fallback 到：
   - 名称 = `<title>` 标签（"中古商品知识系统 | BOOMER-OFF Vintage"，太长被截断成"中古商品实时识…"，而且系统给了灰色默认底）
   - 图标 = favicon.png（只有 64×64，桌面需要 192/512px，缩放后模糊，甚至直接显示首字符占位图）

2. **缺少高分辨率 apple-touch-icon**  
   iOS Safari 加桌面要 180×180 的 PNG，安卓 PWA 标准要 192×192 和 512×512。当前 favicon 只有 64×64。

3. **现有 logo 是横版**（1904×568，"BOOMER-OFF VINTAGE" 长 logo），不能直接做方形 App 图标。

## 解决方案

### 1. 生成方形 App 图标（3 个尺寸）

基于现有 favicon.png 的 "BO" 字母 monogram 风格，重新用图像生成做一张高清 1024×1024 的方形图标，然后用 ImageMagick 派生出：
- `public/icon-192.png` （Android PWA 标准）
- `public/icon-512.png` （Android PWA 高清/启动屏）
- `public/apple-touch-icon.png` 180×180 （iOS 桌面）

### 2. 创建 `public/manifest.json`

```json
{
  "name": "中古商品知识系统",
  "short_name": "中古识别",
  "description": "AI 秒级识别中古商品",
  "start_url": "/scan",
  "display": "standalone",
  "background_color": "#0F172A",
  "theme_color": "#0F172A",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

要点：
- `short_name`「中古识别」是桌面图标下方实际显示的短名称（≤12 字最佳）
- `start_url: /scan` 让用户从桌面打开后直接进识别页
- `display: standalone` 让它像原生 App 一样全屏（去掉浏览器地址栏）

### 3. 在 `index.html` 注册 manifest 和 iOS 图标

在 `<head>` 里追加：
```html
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="中古识别" />
<meta name="theme-color" content="#0F172A" />
```

`apple-mobile-web-app-title` 是 iOS 桌面下方显示的名字（iOS 不读 manifest 的 short_name，要单独配）。

## 用户操作

代码改完发布后，**已经加到桌面的旧图标需要删掉重新添加一次**（浏览器/系统会缓存旧的 favicon），新加的就是高清方图标 + "中古识别" 短名称。

## 需要你确认

- 桌面 App 短名称用 **「中古识别」** 可以吗？还是想用别的（比如「BOOMER-OFF」「中古知识」）？
- 从桌面打开后默认进入 **AI 识别页 (`/scan`)** 可以吗？还是首页 `/`？
