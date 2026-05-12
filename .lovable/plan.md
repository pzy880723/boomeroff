## 移除顶端栏 logo 右上角装饰圆点

`src/components/layout/PublicLayout.tsx` 中右侧 logo 的 `<Link>` 内有一个装饰用的小圆点：

```tsx
<span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-accent ring-2 ring-background" />
```

它没有任何功能含义，仅为视觉装饰。直接删除该 `<span>`，并把外层 `<Link>` 上不再需要的 `relative` 类一并清理（保留 `ml-auto shrink-0`）。

### 受影响文件
- `src/components/layout/PublicLayout.tsx`（仅删除 1 个 span + 清理 1 个无用 class）
