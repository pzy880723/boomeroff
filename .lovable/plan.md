## 目标
在「官方知识库」页面，让二级类目栏在页面上滑时**吸附在顶部**（sticky），下方卡片列表继续向上滚动，方便长列表浏览时随时切换子分类。一级类目网格保持随页面正常滚走。

## 当前问题
所有元素（搜索框、一级网格、二级 chips、内容卡片）都在同一 `space-y-3` 容器里直接滚动，二级类目会随着页面一起滑出可视区域，用户必须滚回顶部才能换二级类目。

## 实现方案

### 1. 二级类目栏 sticky 化（`src/pages/OfficialLibrary.tsx`）
- 给二级类目的外层 `div` 加上 `sticky top-0 z-20 bg-background` 等类名，并加少量 `py` + 底部分隔线，使其吸附时仍美观。
- 由于全站使用 `PageHeader` + 固定底部 Tab 栏，需确认页面真正的滚动容器是 `window`（即外层非 `overflow-auto`）；若是 window 滚动，`sticky top-0` 即可生效；若 `PageHeader` 是 fixed，则 sticky 的 `top` 仍设为 0（PageHeader 在其上层覆盖即可，不影响）。
- 仅在 `subList.length > 0` 时渲染，保持原条件。

### 2. 视觉细节
- 吸附时背景从透明变为 `bg-background/95 backdrop-blur` 以避免下方内容透出杂乱。
- 加 `border-b border-border` 在 sticky 时形成轻微分隔。
- 保留水平滚动 chips 的现有交互。

### 3. 不改动的内容
- 一级类目网格、搜索框、视图切换、卡片渲染逻辑全部保持不变。
- 数据查询、收藏、详情弹窗逻辑不变。

## 技术细节
关键 CSS：
```text
<div className="sticky top-0 z-20 -mx-3 px-3 py-2 bg-background/95 backdrop-blur
                border-b border-border flex gap-1.5 overflow-x-auto scrollbar-none">
```
- `-mx-3 px-3`：让吸附背景横跨容器左右 padding，视觉上贯穿整行。
- `z-20`：高于卡片但低于 Dialog/Header。

## 验收
- 上滑时一级网格随之滚走，二级 chips 抵达顶部后停留，下方内容仍可继续滚动。
- 切换一级类目后二级栏仍正常吸附，无内容时不渲染。
- 下拉回顶部时 sticky 元素回到原位，无视觉跳动。
