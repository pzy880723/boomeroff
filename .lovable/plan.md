## 真正的原因

用户看到的"失败界面"是 `src/components/system/ErrorBoundary.tsx` 里红色三角的"页面出错了"卡片。流程：

1. 用户在 `/scan`（未登录）→ 只加载了 `AuthPage` 的 chunk。
2. 登录成功 → `useAuth` 触发 SIGNED_IN → `Scan.tsx` 立刻渲染 `LiveStreamPanel`（懒加载，首次拉取它的 chunk）。
3. 这个 chunk 首次请求时偶发失败（网络抖动 / Vite 预加载竞态），抛 `Failed to fetch dynamically imported module`。
4. `ErrorBoundary` 捕获 → 显示"页面出错了 · 系统正在更新页面资源，马上为您自动刷新" → 350ms 后 `scheduleChunkReload` 调 `window.location.reload()` → 重新进入，登录态从 localStorage 恢复，看起来"马上又能进入"。

console 也佐证：03:09:23 登录，03:10:50 出现第二次 `[Auth] Initializing auth state...`，正是 reload 重挂载 AuthProvider。

## 方案：三步消除这个闪烁

### 1. ErrorBoundary：识别到"chunk 错误正在自动恢复"时，不要再展示红色"页面出错了"卡片，改成安静的小 spinner

只动 `render()` 分支：当 `state.recovering === true`（即 `isChunkLoadError`）→ 返回简洁的居中 spinner + "正在加载新版页面…" 一行小字，背景沿用 `bg-background`，不出现红色三角、不出现"错误详情"、不出现按钮。真正的非 chunk 报错才走原来的红色卡片。

### 2. 新增 `lazyWithRetry()` 工具：懒加载 chunk 第一次失败时自动重试 2 次再失败

新建 `src/lib/lazyWithRetry.ts`：

```ts
import { lazy } from 'react';
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  delay = 250,
) {
  return lazy(async () => {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try { return await factory(); }
      catch (e) {
        lastErr = e;
        if (!isChunkLoadError(e)) throw e;
        await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
    throw lastErr;
  });
}
```

把现有 `lazy(() => import('...'))` 全部换成 `lazyWithRetry(() => import('...'))`，覆盖范围：

- `src/App.tsx` 所有路由 lazy
- `src/components/layout/MainLayout.tsx`（FloatingDashboard、LevelUpWatcher）
- `src/pages/Scan.tsx`（AuthPage、LiveStreamPanel）

这样绝大多数偶发 chunk 失败在用户根本看不到的 250–500ms 内就被吞掉，不会进 ErrorBoundary。

### 3. ErrorBoundary 自动恢复时间从 350ms 收紧 + 标题更柔和

`scheduleChunkReload` 的 setTimeout 从 350ms 减到 200ms，文案改成"正在加载新版页面"，去掉"页面出错"字样——即使万一兜底进了 spinner 也只看到极短的 loading。

## 不动的

- `useAuth.tsx` 逻辑（登录本身没问题，已在 1–3 秒内完成）
- 路由结构、Supabase 调用
- 业务页面

## 验收

- 退出登录 → 在 /scan 重新登录 → 整个过程只看到登录按钮的 loading spinner + 直接进入识图页，不再出现红色"页面出错了"或刷新按钮
- 触发真正 JS 报错（手动 throw）时仍能看到原本的红色卡片，不影响真错误暴露
- Console 不再出现登录后的二次 `[Auth] Initializing auth state...`（因为不再触发整页 reload）
