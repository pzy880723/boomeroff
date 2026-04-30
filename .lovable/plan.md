## 改动

### 1. `PageHeader.tsx` — logo 移到右侧并放大
- header 高度 `h-14` → `h-16`
- logo 从左侧移到右侧（在 `right` 插槽之后），尺寸 `h-9 w-9` → `h-12 w-12`
- 标题靠左
- `back` 按钮仍在左侧（与 logo 不冲突，详情页通常没有 logo 也可以；保留 logo 在右侧让品牌一致）

### 2. `Me.tsx` — 底部加 logo 和版本号
在最底部设置卡片之后添加一个居中区域：
- BOOMER-OFF logo（约 `h-12 w-12`，灰度/低透明度）
- 文字「BOOMER-OFF · v0.1.0」，`text-xs text-muted-foreground`
- 版本号从 `package.json` 读取（用 `import pkg from '../../package.json'`），或硬编码 `v0.1.0`，采用读取 package.json 方式以便后续自动同步

## 文件
- 改：`src/components/layout/PageHeader.tsx`
- 改：`src/pages/Me.tsx`