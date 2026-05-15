## 问题

在 `/portal` 页面点击 logo 5 次唤出"后台访问验证"弹窗，输入正确密码点击「进入后台」后：
- Toast「已进入后台」立刻出现
- 但密码输入弹窗本身要等好几秒才消失，体验上像是"卡住了"

## 根因

`src/components/layout/PageHeader.tsx` 的 `handleVerify` 里执行顺序是：

```
unlockPortal()
setPwdOpen(false)   // 触发 Radix Dialog 关闭动画
toast.success(...)
navigate('/portal') // 立刻导航
```

两个问题叠加：

1. 当前已经在 `/portal`，`navigate('/portal')` 仍会触发 Portal 页重新渲染 + `usePermissions` 重新拉取 + Sheet/Accordion 重建，主线程繁忙，Radix Dialog 的关闭动画/卸载被推迟。
2. `setPwdOpen(false)` 是关闭动画起点，紧接着同步 `navigate` 抢占渲染，导致 dialog 视觉上停留 1–3 秒才真正消失。

## 修复方案（仅前端，单文件）

文件：`src/components/layout/PageHeader.tsx`，函数 `handleVerify`

1. 验证通过后，先 `unlockPortal()` + `setPwdOpen(false)` + 清空密码，让 Dialog 立即开始关闭动画。
2. 用 `useLocation()` 读当前路径：
   - 如果已经在 `/portal`，**不再 navigate**，直接 `toast.success('已进入后台')`，避免无谓重渲染（用户视觉上 dialog 立刻消失，Portal 内容因为 `PortalGuard` 已解锁会自动显示完整菜单）。
   - 否则用 `requestAnimationFrame` 把 `navigate('/portal')` 推到下一帧再执行，让关闭动画有时间起步。
3. 同时给 Dialog 的 `onOpenChange` 加防御：关闭时清空 `pwd` / `pwdError`，避免下次打开残留状态。

## 验证

- 在 `/portal` 路由下点 logo 5 次 → 输密码 → 点「进入后台」：弹窗应**立即**消失，toast 出现，页面无明显卡顿。
- 在非 `/portal` 路由（如 `/me`）下同样操作：弹窗立即关闭，随后跳转到 `/portal`。
- 输错密码仍显示红框 + 「密码不正确」，行为不变。
- 取消按钮、ESC 关闭行为不变。

## 不改动

- 密码、tap 计数、PortalGuard 权限校验逻辑均不变。
- 其它使用 `PageHeader` 的页面不受影响。
