# 让「我的应用」拖拽像 iOS 一样丝滑

## 根因

当前 `AppGrid.tsx` 用 dnd-kit 的 `DragOverlay` + `isDragging ? opacity-30` 组合：
- **重影 / 阴影**：`DragOverlay` 会在指针下渲染一个"漂浮副本"（带 `scale-110` + 大阴影），同时原位的 tile 变半透明 —— 用户同时看到两个 tile，就是所谓"重影"。
- **无法插入间隙、邻居不让位**：
  - 用了 `closestCenter` + `rectSortingStrategy`：只有指针"越过某个 tile 的中心线"才会触发换位，指到两个图标之间的**间隙**时没有目标被识别，邻居就不动。
  - `PointerSensor(distance:5)` 在触屏上偶尔被浏览器滚动抢占，导致拖动一半神经中断。
  - `SortableTile` 的 `style.transition` 只在 dnd-kit 主动派发 shift 时有值，没派发时 = 无过渡 → 邻居看起来"瞬移"或"完全不动"。

## 修法

改用 dnd-kit 原生的"就地拖拽 + 邻居让位"模式，不用 DragOverlay。

### 1. 干掉重影
- 删除 `<DragOverlay>` 及其分支渲染。
- `SortableTile` 上不再把 `isDragging` 时降为 `opacity-30`；改为"被拖动 tile 微微放大 + 抬起阴影"，且**仍然占据自己那一格**（dnd-kit 的 `transform` 会让它跟着指针走）：
  ```
  isDragging && 'z-30 scale-[1.08] shadow-[0_20px_30px_-12px_rgba(0,0,0,0.35)]'
  ```
- 结果：屏幕上只有一个 tile 在动，即所见即所得。

### 2. 邻居真正让位
- 碰撞检测 `closestCenter` → `closestCorners`（对网格更宽容，指到间隙也能命中最近角）。
- `SortableContext` 策略保持 `rectSortingStrategy`。
- `SortableTile` 的 style 显式补齐**空闲过渡**，让每次 order 变化都插值到位：
  ```ts
  style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 220ms cubic-bezier(0.2, 0, 0, 1)',
  }
  ```
  （现在已经写了 `??`，但没有 transition 时是 undefined —— 保留兜底，同时把 dnd-kit `useSortable` 的 `animateLayoutChanges` 显式打开：`useSortable({ id, animateLayoutChanges: () => true })`。这一步是让"被移开又移回"也会补动画。）

### 3. 触屏顺滑度
- 在 `useSensors` 里把 `PointerSensor` 换成 `PointerSensor + TouchSensor` 组合：
  ```ts
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  ```
  - `delay:120` + edit 模式下才启用 → 短按不会误触，长按后一直贴着手指。
  - `tolerance:6` 允许 6px 抖动，防止手指微抖被判定为 scroll。
- Tile 外层保持 `touch-none`（已存在），并给 `SortableContext` 外层容器加 `overscroll-contain`，避免拖到边缘时页面被拉动。

### 4. 视觉细节
- Wiggle 抖动：拖动中的 tile 停止抖动（原来只对 `!isDragging` 生效，保留）。
- 邻居让位曲线：全局给 tile 一层 `will-change: transform`，防止移动端 GPU 掉帧。

## 影响文件

- `src/components/home/AppGrid.tsx`（唯一文件）

## 不动的部分

- 长按 450ms 进入编辑态的手感
- 编辑态点 X 删除 / + 添加、`localStorage` 排序持久化
- 图标外观本身（上一轮的扁平红瓷 squircle）