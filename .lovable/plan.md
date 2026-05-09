## 目标
让「我的」页面里 LevelCard（等级卡片）顶部的等级文字与「等级规则」文字整块都可以点击打开等级规则抽屉，而不是只有 ⓘ 小图标可点。

## 现状
`src/components/me/LevelCard.tsx` 里：
- 抽屉触发器 `<DrawerTrigger>` 只包裹了右上角的 `ⓘ + 等级规则` 这个小按钮
- 左侧的 `Lv.20 古道掌门` 文字完全不能点
- 右侧按钮虽然 icon 和文字都在同一个 `<button>` 里，但因为字号小（text-xs）、间距小（gap-1）、整块只占很窄一条，手指容易只点到图标位置

## 改动方案（仅前端 UI）
只编辑 `src/components/me/LevelCard.tsx`：

1. 把整个卡片顶部一行（`Lv.X 标题` + 右侧的「等级规则」入口）都作为打开抽屉的触发区：
   - 用一个 `<DrawerTrigger asChild><button>…</button></DrawerTrigger>` 包裹整行 flex 容器
   - 这样点 `Lv.20`、`古道掌门`、`等级规则`、`ⓘ`、空白处都能打开抽屉
2. 同时把右侧「等级规则」按钮的可点击区域加大：
   - 加 `px-2 py-1 -mx-2 -my-1`（视觉位置不变，但 hit area 更大）
   - `gap-1` 改 `gap-1.5`，让图标和文字之间也算点击区
3. 给整行加上 `cursor-pointer`、`role="button"`、`aria-label="查看等级规则"`，无障碍可达
4. 不动抽屉内容、不动进度条、不动经验数值显示

## 不在范围内
- 不改 `src/lib/level.ts` 的等级或经验规则
- 不改签到卡 / 数据库 / 经验触发器
- 不调整其他页面

## 技术细节
- 因为整行变成了 `<button>`，里面不能再嵌一个 `<button>`（HTML 不允许嵌套交互元素）。所以右侧那个原来的小 `<button>` 要降级成 `<span>`，仅作为视觉提示，整行的外层按钮负责真正的点击。
- `Drawer` 的 `open / setOpen` 状态保持不变，仍由 React state 控制。