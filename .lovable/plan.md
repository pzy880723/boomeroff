## 调整 PublicLayout 顶端栏 logo 位置与裁切

仅修改 `src/components/layout/PublicLayout.tsx` 中的 `<header>` 内容。

### 1. 布局：logo 移到右侧

将原先的单一 `<Link>`（包含 logo + 标题文字）拆分为两部分：

- **左侧**：标题文字区（"中古识物" + "Tap · Discover"），整体仍包在 `<Link to="/u">` 中，保留 `id="onboard-logo"`（onboarding 引导锚点不能丢）。
- **右侧**：logo 图形，独立的小 `<Link to="/u">`，用 `ml-auto` 推到最右。

容器仍是 `flex h-14 items-center gap-3`。

### 2. 裁切：去掉 logo 上下白边

不改图片源文件，纯 CSS：

```tsx
<div className="h-7 w-9 overflow-hidden flex items-center justify-center">
  <img
    src={logo}
    alt="中古识物"
    className="h-14 w-auto object-contain -my-3.5"
  />
</div>
```

思路：外层容器固定为较扁的高度（`h-7` ≈ 28px）并 `overflow-hidden`；内部 `<img>` 用原本两倍高度（`h-14`）+ 负 margin 上下抠掉白边部分，让图中"文字部分"恰好落在容器可视区。

如果实测裁切比例不对，会微调 `h-14` / `-my-3.5` 这两个数值（不需要改其它文件）。

### 3. 保留事项

- 右上角红点装饰 `absolute -top-0.5 -right-0.5`：跟随 logo 一起移到右侧。
- `id="onboard-logo"`：放在左侧标题文字 Link 上，保证现有 GuestOnboarding 步骤的目标元素仍存在（如果 onboarding 是指向 logo 图形本身，则改放到右侧 logo 上——会先在文件里 grep `onboard-logo` 用法确认）。
- 其它文件、底部 tab、PublicScan 引导逻辑均不动。

### 受影响文件

- `src/components/layout/PublicLayout.tsx`（仅 header 区域）
