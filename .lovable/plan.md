## 性能监测结果

我用浏览器性能工具实测了 `/scan` 首屏，关键数据：

- **首次内容绘制 (FCP)**：7.8 秒（理想 < 1.8s）
- **DOMContentLoaded**：7.7 秒
- **完整加载**：7.9 秒
- **TTFB**：1.13 秒（服务器响应正常）

## 真正拖慢首屏的 3 个原因

### 1. favicon.png 高达 380KB（最严重的"性价比"问题）
作为图标只需要几 KB，现在却是一张未压缩的大图，浏览器在首屏期间花了 1.4 秒下载它，并占用了网络带宽。

### 2. Google Fonts 拉取过多字体权重（约 151KB CSS + 后续字体文件）
`src/index.css` 第 1 行：
```
Noto Sans SC: 400, 500, 600, 700, 800 五个粗细
Playfair Display: 600, 700 两个粗细
```
中文字体每个粗细动辄上百 KB，加载 5 个粗细对首屏是致命的。而且通过 `@import` 引入会**阻塞 CSS 解析**，必须等字体 CSS 下载完才能开始渲染。

### 3. 关键依赖串行加载 + 缺少预连接
- Supabase SDK 130KB / 2.1s
- lucide-react 图标 157KB / 1.8s  
- React runtime chunk 139KB / 1.8s

这些都是首屏必需的，但浏览器是串行发现的（解析到 main.tsx → 解析 App.tsx → 才知道要加载 Supabase）。

> 注：开发预览中脚本数量虚高（75 个），这是 Vite 开发模式特性，**生产环境不存在该问题**。但上面 3 项问题在生产同样存在。

## 解决方案

### A. 修复 favicon（影响最大，1 行改动）
重新生成一张 32×32 / 64×64 的 PNG（< 5KB），替换 `public/favicon.png`。预计节省 **375KB + 1.4s**。

### B. 优化字体加载
1. 将字体粗细砍到 2 个：`Noto Sans SC: 400, 600` + `Playfair Display: 700`
2. 把 `@import` 从 CSS 移到 `index.html` 的 `<link rel="preconnect">` + `<link rel="stylesheet">`，避免阻塞 CSS 解析
3. 给 `fonts.googleapis.com` 和 `fonts.gstatic.com` 加 preconnect

预计节省 **~80KB + 200~500ms 渲染阻塞**。

### C. 预连接 + 模块预加载
在 `index.html` 加：
```html
<link rel="modulepreload" href="/src/main.tsx" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```
让浏览器尽早建立连接、并发拉取依赖。

### D.（可选）懒加载 lucide-react 中未用图标
当前 `lucide-react.js` 一次拉 157KB。可以改为按需 import 写法（已经是按需，但 Vite dev 时会预打包整包，生产环境 tree-shake 会自动剔除，所以这一项**生产环境无需处理**，无需改动）。

## 预期效果
完成 A + B + C 后，预计首屏 FCP 从 **7.8s 降到 2~3s**（开发预览），生产环境（Vercel/Lovable CDN）会更快，预期 **< 1.5s**。

## 不会改动的内容
- 业务逻辑、组件结构、路由都保持不变
- 现有的代码分包策略（vite.config.ts 中的 manualChunks）已经写得不错，无需调整
- Supabase / 认证流程不动
