## 问题定位

线上 `ai.boomeroff.com` 顶栏只显示"BOOMER GO"文字（img alt 回退），Logo 图裂。实测：

```
curl -I https://ai.boomeroff.com/__l5e/assets-v1/.../boomer-go-wordmark.png
→ 200, content-type: text/html   # 返回的是 SPA 的 index.html，不是图片
curl -I https://boomeroff.lovable.app/__l5e/...
→ 200, content-type: image/png   # Lovable 官方域名正常
```

根因：`PageHeader.tsx` 和 `Home.tsx` 里的 wordmark 引用的是 `boomer-go-wordmark.png.asset.json` 里的 URL `/__l5e/assets-v1/...`。这个路径只有 Lovable 自家域名会代理到 R2；用户自建 nginx 的 `ai.boomeroff.com` 没有配置这个反代，SPA 的 catch-all 兜底把它当成前端路由，返回 index.html，浏览器就把它当图片加载失败 → 显示 alt 文本。

而首页左上角 Header 的 Logo 用的是 `@/assets/boomer-go-logo.png` 直接 import（走 Vite 打包，产物路径是 `/assets/xxx.hash.png`），所以那个是正常显示的——这也解释了"之前没出问题"：之前顶部用的是本地打包 logo，最近改成用 asset.json 里的 wordmark 之后才坏。

## 修复方案

统一改回"Vite 本地打包"路径，不再依赖 `__l5e` 运行时代理。

1. 把 wordmark 真图落到源码里
   - 从 CDN 下载真实 PNG 保存为 `src/assets/boomer-go-wordmark.png`（原 asset.json 保留不动，避免其它引用意外报错）。

2. 改引用（把 `.asset.json` 换成直接 import PNG）
   - `src/components/layout/PageHeader.tsx`
     `import brandWordmark from '@/assets/boomer-go-wordmark.png.asset.json'` → `import brandWordmarkUrl from '@/assets/boomer-go-wordmark.png'`，`<img src={brandWordmark.url}>` → `<img src={brandWordmarkUrl}>`。
   - `src/pages/Home.tsx` 同上。

3. 顺手扫一遍类似的 `.asset.json` 引用（`boomer-off-wordmark.png.asset.json`、`icon-xhs-activity.png.asset.json`），当前只有 wordmark 是在活跃路径上被引用，其它没有 import 就不动，避免范围扩散。

## 验证

- 本地 build 后检查 `dist/assets/` 里应出现 `boomer-go-wordmark-*.png`，HTML 里指向 `/assets/...`。
- 部署后打开 `ai.boomeroff.com/me`，顶栏右上应显示 Logo 图；`curl -I` 该资源应返回 `content-type: image/png`。

## 不做

- 不去改 nginx 配置（不在 Lovable 项目范围内）。
- 不改 `Header.tsx`（本来就是打包路径，正常）。
- 不动 backend / 数据库 / 其它业务代码。
