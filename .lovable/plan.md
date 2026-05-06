## 目标
官方知识详情页（`src/pages/OfficialDetail.tsx`）顶端的四个圆形按钮（返回 / AI 修改 / 编辑 / 收藏）改为**固定吸顶**，并随滚动切换样式：
- 在封面图区域内：保持现在的样子（透明底 + `bg-background/80` 玻璃感，浮在大图上）。
- 滚出封面图后：整条顶栏出现半透明背景（`bg-background/80 backdrop-blur` + 细底边），按钮继续显示在其上。

## 实现方案

### 1. 改动文件
仅 `src/pages/OfficialDetail.tsx`（纯 UI 调整，不动业务逻辑）。

### 2. 结构调整
- 把现在散落在 Hero 内的两组绝对定位按钮（左上返回 + 右上 AI/编辑/收藏）抽出，放进一个新的 `fixed top-0 left-0 right-0 z-30` 容器，内部 `container mx-auto max-w-screen-md flex justify-between items-center px-3 py-2`。
- Hero（封面图）保持原结构，但移除原先 `absolute` 的按钮。
- 因为变成 fixed，body 顶部不再被按钮"占位"——封面图本来就在最顶，视觉无需补 padding；但要确保封面图高度仍 `aspect-[4/3]`，按钮浮在其上。

### 3. 滚动样式切换
- 用 `useEffect` + `window.scroll` 监听 + `useState` `scrolled` 布尔值。
- 阈值 = 封面图高度。简化做法：用一个隐藏 sentinel `<div ref={sentinelRef} />` 放在封面图末尾，配合 `IntersectionObserver`，当 sentinel 离开视口顶部即 `scrolled = true`。比读 DOM 高度更稳。
- 顶栏 className 条件：
  - `scrolled` → `bg-background/80 backdrop-blur border-b border-border/60`
  - 否则 → `bg-transparent`
- 单个按钮始终保留 `bg-background/80 backdrop-blur`（保持封面图上的可读性）；滚动后看上去自然融入吸顶栏。

### 4. 细节
- `z-index`：吸顶栏 `z-30`；现有 Lightbox `z-50`、底部操作栏 `z-20` 不冲突。
- 移动端安全区：`pt-[env(safe-area-inset-top)]` 加在吸顶栏上。
- 不改按钮顺序、图标、aria-label、点击逻辑，只搬位置 + 加滚动样式。

### 5. 不做的事
- 不动 `KnowledgeChatPanel`、底部操作栏、Hero 图片本身。
- 不引入新依赖。
