## 目标
点"进入后台"后立即看到后台页面，去除"登录框还停留一会"的卡顿感。

## 改动点

### 1. 预加载 Portal 路由 chunk（最关键）
- 在 `src/pages/PortalGuard.tsx` 同目录暴露一个 `preloadPortal()` 帮助函数，内部就是触发 `import('./Portal')` 与 `import('./PortalGuard')`。
- 在 `src/components/layout/Header.tsx`：
  - 用户**单击 logo 第 1 下**就调用 `preloadPortal()`（5 次点击触发密码框，等用户输完密码时 chunk 多半已就绪）。
  - 密码框 `onOpenChange(true)` 时再保险调用一次。
  - 输入框 `onFocus` 也调用一次。

### 2. 立即跳转 + 关闭框无动画停留
- `handleVerify` 改为：先 `navigate('/portal')`，再 `setPwdOpen(false)`，让路由切换先发生，框跟随卸载，不再"先等动画再跳"。
- 按钮加 `loading` 态（`Loader2` 转圈 + 禁用），点击瞬间给反馈，避免用户重复点。

### 3. 友好的路由 fallback
- `App.tsx` 的 `RouteFallback` 改为带"正在进入后台…"文案的居中卡片（不只是一个孤零零的小转圈）。仅文案层面，不影响其他懒加载页。
  - 如果不想全局变化，可以单独给 `/portal` 包一个带文案的 `Suspense`。倾向后者，影响面小。

### 4. PortalGuard 权限 loading 体验
- `PortalGuard` 已有 `loading` 分支，把里面的小转圈换成同款"正在进入后台…"占位，保持视觉连贯（不闪两种 loading）。
- 不改权限查询逻辑本身（`usePermissions` 在登录后通常已经预热完毕，无需重复查询）。

## 不动的部分
- 不改 `useAuth`、`usePermissions` 的数据查询逻辑。
- 不改密码校验、`sessionStorage` 解锁逻辑。
- 不改其他路由的懒加载策略。

## 预期效果
- 用户点 logo 时 Portal chunk 已经在后台下载。
- 点"进入后台"瞬间路由切换，框直接消失（无动画停顿）。
- 即便 chunk 尚未就绪，看到的也是"正在进入后台…"的明确提示，而不是"登录框还在 + 小转圈"的错觉。
