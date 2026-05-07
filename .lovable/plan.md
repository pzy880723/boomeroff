# 提高加载速度方案

当前问题：所有页面（含 Community 551 行、MyLibrary 721 行、OfficialDetail 573 行、LiveStreamPanel 1232 行）和重型库（recharts、html-to-image、react-markdown、embla-carousel、dnd-kit 等）全部打包进首屏 bundle，移动端首屏体积大、解析慢。

## 改动

### 1. 路由懒加载（最大收益）
`src/App.tsx` 改用 `React.lazy + Suspense`，对所有页面拆包：
- `Scan / OfficialLibrary / OfficialDetail / MyLibrary / Community / Me / History / Portal / Invite / ResetPassword / CheckInHistory / NotFound` 全部 lazy
- Suspense fallback 用一个轻量 loading（复用现有 `Loader2` spinner，配 `min-h-screen`）
- 仅 `MainLayout / AuthProvider / Toaster` 留在主包

预计首屏 JS 缩减 50%+。

### 2. Vite 手动分包
`vite.config.ts` 增加 `build.rollupOptions.output.manualChunks`，把第三方库拆成独立 chunk，浏览器可并行下载并长缓存：
- `react-vendor`：react / react-dom / react-router-dom
- `supabase`：@supabase/supabase-js
- `ui-vendor`：所有 @radix-ui/*
- `charts`：recharts
- `markdown`：react-markdown
- `image-tools`：html-to-image
- `dnd`：@dnd-kit/*
- `carousel`：embla-carousel-react、vaul
- `query`：@tanstack/react-query

### 3. 图片优化
- `src/pages/Me.tsx` 底部 logo 加 `loading="lazy" decoding="async"`
- `src/components/layout/PageHeader` / `BottomTabBar` 中的 logo 同样加 `decoding="async"`（如已用）
- 历史 / 社区 / 知识库列表里的商品图片统一加 `loading="lazy" decoding="async"`（Community / MyLibrary / OfficialLibrary / History）

### 4. React Query 默认缓存
`src/App.tsx` 的 `new QueryClient()` 加默认 options：
- `staleTime: 60_000`（1 分钟内不重复请求）
- `gcTime: 5 * 60_000`
- `refetchOnWindowFocus: false`

减少切 tab 回来时的重复请求。

### 5. index.html 预连接
`index.html` `<head>` 加 `<link rel="preconnect" href="https://narqwgwpqglathwtyevz.supabase.co" crossorigin>`，让 Supabase 首个请求更快建链。

## 不动的部分
- 不改业务逻辑、RLS、edge functions、认证流程
- 不改 design system / tokens
- 不改 `installStorageShim` 调用顺序
- 不动 `src/integrations/supabase/client.ts`

## 验证
- `bun run build` 看产物 chunk 拆分是否生效、首屏 entry 是否变小
- 预览刷新，Network 面板看首屏 JS 总量、TTI 是否下降
- 切换各 tab，首次进入有短暂 fallback 是预期行为，不应白屏报错
