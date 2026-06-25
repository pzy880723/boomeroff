## 现象
打开素材库里的视频缩略图(或视频播完)有时会被根 ErrorBoundary 接住,跳到"BOOMER 也懵了"页面,体验非常不对。

## 排查结论(可疑点)
1. 详情弹窗里的 `LazyVideoPlayer` 是上一轮新加的。`<img fetchPriority="high">` 在 React 版本不一致时会抛 prop 警告升级为错误;`autoPlay` + 手动 `play()` 在某些移动浏览器会抛 `DOMException`,如果某条链路把它当成渲染期异常,就会被外层 boundary 吞掉。
2. 视频播完时,如果绑定的 `output_url` 或 `poster` 是失效的签名 URL,`<video>` 的 onerror 不会冒泡到 React;但同期 realtime `postgres_changes` 回调里 `setItems(prev => prev.map(...))` 的某次更新可能让 `LazyVideoPlayer` 的 props 变成意料外的形状(比如 meta 突然变 null),触发渲染期 throw。
3. 现在整页只有根 ErrorBoundary,任何子树报错都会把整个 App 卷走;所以即使只是详情弹窗里的一个小错误,用户也会被踢到"BOOMER 也懵了"。

## 改动范围(仅前端)

### 1. `src/pages/marketing/MarketingLibrary.tsx`
- 在页面外层用一个轻量的 `LibraryErrorBoundary` 包住,只显示一个内联的"加载视频出错,点这里重试"提示,不再冒到根 boundary。
- 这个 boundary 同时 `console.error` 出原始 error/stack,方便下次定位。

### 2. `src/components/marketing/AssetDetailDialog.tsx` — 加固 `LazyVideoPlayer`
- 移除 `autoPlay`,只用 effect 里的 `play().catch(()=>{})`,避免某些浏览器把 autoplay 拒绝当异常抛出。
- 把 `fetchPriority` 改成小写 `fetchpriority`(对所有 React 版本都安全)。
- 给 poster 加 `onError={() => setPoster(undefined)}` 兜底,避免坏图无限重试。
- 给整个 player 包一层 try/catch 的函数式渲染,任何渲染期异常 fallback 成"视频暂不可用 · 点这里重新加载"按钮,而不是抛出去。
- 当 `src` 缺失或为空字符串时直接 render 占位,不再 mount `<video>`。

### 3. `MarketingLibrary.tsx` realtime 回调降噪
- `fetchItems(true)` 失败时只 `console.warn`,不让异常冒到组件树;
- `setItems` 的合并函数对 `meta` 做 `meta ?? {}` 兜底,防止偶发 null。

## 不在范围
- 不动数据库、不动 edge function、不动渲染/拼接管线;
- 不改根 ErrorBoundary 的样式,只是少触发它。

## 验收
- 反复打开/关闭任意视频卡片不再跳到错误页;
- 视频播完后停留在详情弹窗里;
- 真出错时弹窗内有可点击的重试按钮,控制台能看到具体堆栈。