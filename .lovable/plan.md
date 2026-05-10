## 问题

`/library/:id`（官方知识详情页）没有走 `MainLayout`，所以页面底部没有底部 Tab 栏。但按钮容器仍然写的是 `fixed bottom-16`（距底部 64px），等于把它顶到了一段空白之上，看起来"悬浮在中间"。

```
src/pages/OfficialDetail.tsx:536
<div className="fixed bottom-16 left-0 right-0 z-20 ...">
```

## 修复

把这一行的定位改成贴底，并加上 iOS 安全区内边距，让按钮真正紧贴屏幕底部、且在带 Home Indicator 的机型上不会被遮挡：

```tsx
<div className="fixed bottom-0 left-0 right-0 z-20 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t">
```

同时把页面正文的底部留白从原本依赖 `bottom-16` 的间距改为给内容容器加 `pb-24`（或确认现有 padding 仍然足够），避免最后一段内容被这条按钮条压住。我会在改完后用预览的 390×844 视口确认按钮真的贴底、且不挡正文。

## 影响范围

仅 `src/pages/OfficialDetail.tsx` 一个文件，纯样式调整，不动业务逻辑。
