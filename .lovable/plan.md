## 目标
把整个网页的「网页图标 / favicon」（浏览器标签页、分享链接缩略图旁边的小图标）换成 BOOMER-OFF Vintage 红色 logo。

## 现状
- `index.html` 没有任何 `<link rel="icon">`，浏览器默认请求 `/favicon.ico`
- `public/` 目录里目前应该有一个默认 `favicon.ico`，会覆盖任何同名替换
- 用户已上传 logo 图：`user-uploads://IMG_5966.jpeg`（红底白字 BOOMER-OFF Vintage 方形图）

## 改动方案

1. 把上传的 logo 复制到 `public/favicon.png`（PNG 比 JPEG 在小尺寸下更清晰，背景也保持红色方块，识别度高）
2. 删除 `public/favicon.ico`，避免浏览器优先请求旧的 ico 覆盖新图标
3. 在 `index.html` 的 `<head>` 里加：
   ```html
   <link rel="icon" type="image/png" href="/favicon.png" />
   <link rel="apple-touch-icon" href="/favicon.png" />
   ```
   - `apple-touch-icon` 让 iOS「添加到主屏幕」和部分 App 内分享卡片也用这张图
4. 同时给 OG 分享卡片补一张缩略图，让微信 / iMessage / Twitter 分享链接时图标用 logo：
   ```html
   <meta property="og:image" content="/favicon.png" />
   <meta name="twitter:image" content="/favicon.png" />
   ```

## 不在范围内
- 不改 app 内的 logo 组件（`src/assets/boomer-off-vintage-logo.png` 继续使用）
- 不改 `ShareMenu` 生成的长图卡片（那个是另一个东西，已经带 logo）
- 不改任何业务逻辑、数据库、等级系统

## 注意
- 浏览器对 favicon 有强缓存，发布后用户可能要硬刷新或等几分钟才看到新图标
