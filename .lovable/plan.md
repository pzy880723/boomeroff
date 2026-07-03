# 修复线上发布后白屏（Cannot read properties of undefined (reading 'forwardRef')）

## 问题
- 预览环境（dev）正常，发布后 https://boomeroff.lovable.app/ 是空白页。
- Playwright 抓到 pageerror：`Cannot read properties of undefined (reading 'forwardRef')`，`#root` 为空。
- 原因：`vite.config.ts` 的 `manualChunks` 把 `react / react-dom / scheduler` 拆到 `react-vendor`，同时把 `@radix-ui` 拆到 `radix` chunk。Rollup 生成的 chunk 图存在循环/顺序问题，导致 `radix` chunk 执行 `React.forwardRef` 时 React 尚未初始化，全站崩溃。

## 修复方案（只改一个文件：`vite.config.ts`）
1. 保留代码分包收益，但把所有"依赖 React 且会在模块顶层调用 React API（forwardRef/createContext 等）"的第三方库并入同一个 `react-vendor` chunk，彻底消除顺序风险：
   - `react`、`react-dom`、`react/jsx-runtime`、`scheduler`
   - `@radix-ui/*`
   - `react-hook-form`、`@hookform/*`
   - `@tanstack/react-query`、`react-router-dom`
2. 其余非 React-critical 的大依赖继续独立分包（体积收益仍在）：
   - `@supabase/*` → `supabase`
   - `recharts` / `d3-*` → `charts`
   - `react-markdown` / `remark*` / `micromark*` / `mdast*` / `hast*` → `markdown`
   - `react-day-picker` / `date-fns` → `date`
   - `@dnd-kit/*` → `dnd`
   - `embla-carousel*` → `carousel`
   - `html-to-image` → `html-to-image`
   - `lucide-react` → `icons`
3. 不改动任何业务代码、路由、样式或后端逻辑。

## 验证
1. 本地构建 (`bun run build`) 观察 chunk 列表，确认 `radix` chunk 已合并进 `react-vendor`。
2. 用 Playwright 打开线上 URL（发布后），断言：
   - HTTP 200
   - `#root` innerHTML 长度 > 0
   - 无 `pageerror`，无 `forwardRef undefined` 报错
3. 手动回归首页 / 底部 5 个 Tab / AI 识图 / 中古圈，确认无回归。

## 风险
- `react-vendor` chunk 会略微变大（几十 KB gzip），但由长效缓存，属可接受代价。
- 不涉及数据库、Edge Function、RLS，无数据风险。
