## 修复 PublicLayout 顶端栏 logo 显示

源图 `boomer-off-vintage-logo.png`（约 1928×577，比例 ~3.3:1）本身没有白边，之前用 `overflow-hidden` + 负偏移做"裁切"是误判，把 logo 切残了。

### 改动（仅 `src/components/layout/PublicLayout.tsx`）

把右侧 logo 区从 `h-7 w-12 overflow-hidden` 容器 + `h-16 max-w-none` 的图片改成完整显示：

```tsx
<Link to="/u" className="ml-auto relative shrink-0" aria-label="中古识物">
  <img
    src={logo}
    alt="中古识物"
    draggable={false}
    className="h-9 w-auto object-contain"
  />
  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-accent ring-2 ring-background" />
</Link>
```

- `h-9`（36px）让 logo 在 56px 高的 header 内完整可见，宽度自动按比例约 120px。
- 去掉 `overflow-hidden` 容器和负 margin，logo 完整呈现"BOOMER·OFF / Vintage"。
- 红点装饰位置同步微调到 `-right-1`，避免遮住 OFF 的 F。

左侧"中古识物 / TAP · DISCOVER" 文字、底部 tab、引导逻辑均不动。

### 受影响文件

- `src/components/layout/PublicLayout.tsx`
