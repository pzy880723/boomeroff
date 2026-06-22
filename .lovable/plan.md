## 问题定位

`/me/marketing/image`(`src/pages/marketing/AiImage.tsx`)第 205 行:
```tsx
<div className="flex flex-col h-[calc(100vh-3.5rem)]">
```

只减了 PageHeader 的 3.5rem,**没有减底部 Tab 栏的 4rem**(`MainLayout` 给 `main` 加了 `pb-16`,`BottomTabBar` 高 12 ≈ 3rem 但留了安全区)。结果整个 flex 容器的"底"落在屏幕外面,输入区(模板/尺寸/附图/输入框)被 Tab 栏挡住,看起来"超出底部"。另外移动端浏览器地址栏伸缩用 `100vh` 还会再多算一截。

## 改法(只动 AiImage 一处,纯 CSS)

`src/pages/marketing/AiImage.tsx` 第 205 行,把外层容器高度从
```tsx
<div className="flex flex-col h-[calc(100vh-3.5rem)]">
```
改成
```tsx
<div className="flex flex-col h-[calc(100dvh-3.5rem-4rem)]">
```

- `100dvh` 替代 `100vh`,跟着手机地址栏自适应,不会再算多。
- `-4rem` 把底部 Tab 栏的 `pb-16` 减掉。
- flex 布局已经有 `shrink-0`(输入区)+ `flex-1 overflow-y-auto`(对话流),所以容器一旦高度正确,输入区就自动钉在底部、不再被遮、也不会跟着对话流上下滑。

不动的部分:输入区内部排版、模板/比例/附图/textarea 都保持现状,只是它现在真的会贴在可见区域底部。其他 marketing 页面(Photo/Copy/Video)不受影响。

## 验证
1. iPhone 视口 390×598 打开 `/me/marketing/image`,输入框完全可见,在底部 Tab 栏上方,不能滑动。
2. 滚动对话区,顶部 ShopPicker 不动、底部输入区不动,只有中间消息流滚。
3. 横屏 / iPad 也正常,因为 `dvh` 自适应。
