## 两件事

### A. 仪表盘"出错了" — 先定位再修

目前看到的「出错了」文字来自全局 `ErrorBoundary`（`src/components/system/ErrorBoundary.tsx`），它包在 `MainLayout` 的 page 层级。这意味着 DashboardInner 里抛了一个错，把整页都打挂了，我们却看不到具体堆栈。

**改动**：

1. 在 `src/components/spirit/SpiritDrawer.tsx` 里给 `DashboardInner` 单独再套一层 `ErrorBoundary`（scope="spirit-dashboard"），fallback 只是抽屉内一个友好的小卡片（"仪表盘加载失败，请刷新重试"），并把 `console.error` 出的报错信息显示在 details 折叠区。
   - 好处：不再把整页打挂；同时下次复现时你能截图给我，我就能精准修。

2. 同步检查 `useDashboardData.ts` 几个常见崩点：`profile`/`todayShift` 为 null 时子组件的 `?.` 防御、`weekShifts` / `weeklySpark` 数组长度防御。逐个加 null-guard，把目前可见的非空假设变成可选。

如果之后你截图发来真实报错，我再做对应业务修复。这一步是**先止血 + 收集信息**。

### B. 移动端输入框点开自动放大、回不去

iOS Safari 规则：当 `<input>/<textarea>` 的 `font-size < 16px` 时，focus 会自动 zoom-in，且不会自动 zoom-out。当前 `SpiritChatPanel` 输入框是 `text-[13px]`，命中此 bug。

**改动**（二选一组合，做最稳的）：

1. `index.html` viewport meta 增加 `maximum-scale=1, viewport-fit=cover`（保留 `initial-scale=1`），从根上禁止 focus 缩放。这是 PWA / 类 app 站点的标准做法。
2. 同时把 `SpiritChatPanel.tsx` 第 227 行那个 `<Textarea>` 的字号从 `text-[13px]` 提升到 `text-[16px]`，作为兜底（万一某些浏览器忽略 maximum-scale）。视觉上 16px 在小输入框里也不会怪。

> 不动其它输入框，因为用户只反馈了小精灵对话框；后续看到别的地方有同样毛病，再统一处理。

## 涉及文件

- `index.html`（viewport meta）
- `src/components/spirit/SpiritDrawer.tsx`（包 ErrorBoundary）
- `src/components/spirit/SpiritChatPanel.tsx`（输入框字号 13 → 16）
- `src/hooks/useDashboardData.ts` / `src/components/dashboard/ProfileHeaderCard.tsx` / `TodayPanel.tsx` 等（按需加 null-guard，量小）

## 不在范围

- 不修动其它页面输入框的字号（暂未反馈问题）。
- 不直接猜测仪表盘 root cause —— 等局部 ErrorBoundary 抓到真实堆栈再精修。
