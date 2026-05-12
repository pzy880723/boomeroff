## 目标
顾客版引导每次"打开应用"只显示一次，切换 tab / 路由不再触发；完全关闭页面后再次进入才重新展示。

## 方案
使用 `sessionStorage` 作为记忆载体（关闭标签页/浏览器即清空，符合"关闭后第二次再进入"的语义）。

### 修改 `src/pages/public/PublicScan.tsx`
- key：`guest_onboarding_shown_v1`
- 初始 state：`useState(() => !sessionStorage.getItem('guest_onboarding_shown_v1'))`
- `onDone` 回调里：`sessionStorage.setItem('guest_onboarding_shown_v1', '1')` 后再 `setShowOnboarding(false)`
- `GuestOnboarding` 内部"跳过"也会触发 `onDone`，所以跳过同样会被记住

### 不动的部分
- `GuestOnboarding.tsx` 组件本身（已是受控渲染）
- 4 步引导内容、样式、记忆 key 之外的逻辑
- 登录版、其他路由

## 备注
- 选 `sessionStorage` 而非 `localStorage`：用户之前说过"每次进入都展示"，本次调整为"每个会话一次"，`sessionStorage` 在关闭标签页后清空，刚好对应"关闭后第二次再进入才显示"。
- 如希望"永久只看一次"可后续改为 `localStorage`，结构不变。
