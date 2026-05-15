## 问题
`FloatingDashboard.tsx` 第 99-112 行用 `localStorage` 的 `dashboard_last_auto_open` 做"每天只弹一次"的判重。今天早些时候已经自动展开过，key 已写入 → 当天再登录命中 `last === today` 直接 return，胶囊出现但不展开。

## 修复方案：每次登录都自动打开

把判重存储从 `localStorage`（跨会话持久）改为 `sessionStorage`（仅当前会话）。每次新登录会话都会自动展开一次，同一会话内多次切页/刷新不会重复弹出。

### 改动 `src/components/dashboard/FloatingDashboard.tsx`
- 把 `AUTO_OPEN_KEY` 改成会话级常量 `'dashboard_auto_opened_session'`
- `useEffect`（第 99-112 行）逻辑：
  - 监听 `user`，登录后读取 `sessionStorage.getItem(KEY)`
  - 若没有 → 700ms 后调用 `openDashboard()`，并 `sessionStorage.setItem(KEY, '1')`
  - 若已有 → 跳过
- 移除已不再使用的 `dashboardAutoOpenKey()` 调用（如它在别处还有引用则保留）

### 顺手清理
顺手 `localStorage.removeItem('dashboard_last_auto_open')` 一次（在同一 effect 内做一次清理），避免遗留垃圾 key。

## 不动的部分
拖拽、胶囊、抽屉内容、动画、`useDashboardData`、`useNotifications` 全部保持不变。预计 ~10 行改动。