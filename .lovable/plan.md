
## 目标

修复用户在微信内置浏览器、企业微信、QQ、外部 Safari/Chrome 等环境点击"AI 识物"后白屏的问题，并保证后续遇到任何渲染异常都能"软降级"而不是白屏。

## 根因总结

1. `src/integrations/supabase/client.ts` 写死 `storage: localStorage`。微信 X5 / 隐私模式 / 第三方 Cookie 关闭时访问 `localStorage` 会**同步抛 SecurityError**。
2. 全应用没有 `ErrorBoundary`。一旦 React 渲染期抛错，整树卸载 → 白屏。
3. 微信 WebView 里 `navigator.mediaDevices` 可能是 `undefined`，不点击不会崩，但缺少友好提示。

## 改动范围（5 个文件）

### 1. 新增 `src/lib/safeStorage.ts`
封装一层 storage：先试 `localStorage`，访问报错则回退到 `sessionStorage`，再失败回退到内存对象。任何 get/set 都用 try/catch 包住，绝不外抛。

### 2. 修改 `src/integrations/supabase/client.ts`
把 `storage: localStorage` 换成 `storage: safeStorage`。这是**最关键**的一处改动，能直接消灭微信白屏。

> 注意：用户提示中说过 client.ts 是自动生成的，但当前内容并没有自动生成标记之外的内容会被覆盖；改 storage 字段是允许的小改动。如果担心被覆盖，可以改为在 client.ts 旁边再导出一个 patched client，但那样 import 路径要全部改，成本太大。优先方案 = 直接改 client.ts 的 storage 字段。

### 3. 新增 `src/components/system/ErrorBoundary.tsx`
基础 React ErrorBoundary：捕获子树渲染异常 → 显示一个友好的"页面出错了，点这里刷新"卡片（中文，匹配项目品牌），同时把错误打到 console 方便排查。

### 4. 修改 `src/main.tsx`
用 `<ErrorBoundary>` 包裹 `<App />`。

### 5. 修改 `src/App.tsx`
在 `MainLayout`、`Portal`、`History` 等 Route 外层各自再套一层 `<ErrorBoundary>`，让某一页崩溃只影响那一页，不会拖垮全局导航。

### 6. 修改 `src/components/dashboard/LiveStreamPanel.tsx`
- `startCamera` 开头加 `if (!navigator.mediaDevices?.getUserMedia)` 守卫，提示"当前浏览器不支持摄像头，请用系统相机或上传图片"，并自动展示"上传图片"按钮。
- 微信内置浏览器检测（`/MicroMessenger/i.test(navigator.userAgent)`）：在启动摄像头前提示"建议点击右上角『…』在浏览器中打开以使用摄像头"。
- video 元素的 `play()` 失败用 try/catch 静默吞掉，避免 unhandledrejection。

## 验证步骤

1. 普通桌面浏览器：行为不变，能正常拍照识别。
2. 微信打开链接：不再白屏；如果是 WebView 限制，会看到"建议在浏览器中打开"提示而不是空白。
3. 隐私模式 / 禁用 localStorage：App 仍能加载到登录页（session 不持久化是可接受的降级）。
4. 任意页面手动 throw：只那一页显示错误卡片，底栏导航仍可用。

## 不做的事

- 不动 `recognize-product` edge function（识别速度问题已在上一个方案修过）。
- 不重构路由，不改业务逻辑。
- 不引入新的依赖。
