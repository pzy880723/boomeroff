## 问题
二级类目栏 `sticky top-0` 看起来没生效，是因为 `PageHeader` 本身就是 `sticky top-0 z-30 h-12`（48px 高），把二级类目栏完全遮住了，所以视觉上"没停留"。

## 修复
在 `src/pages/OfficialLibrary.tsx` 第 189 行，把二级类目栏的 `top-0` 改为 `top-12`，让它在 PageHeader 正下方吸附停留：

```tsx
<div className="sticky top-12 z-20 -mx-3 px-3 py-2 flex gap-1.5 overflow-x-auto bg-background/95 backdrop-blur border-b border-border scrollbar-none">
```

`z-20 < PageHeader 的 z-30`，层级正确，不会盖到 header 上。

## 验收
上滑页面时一级类目随之滚走，二级类目 chips 抵达 PageHeader 底部后吸附停留，下方卡片继续滚动。
