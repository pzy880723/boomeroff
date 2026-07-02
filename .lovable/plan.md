# 应用图标 v3 —— 活泼版（参考「落至晚樱」风格）

## 参考解读

用户附图 icon 风格三个关键动作：
1. **圆形浅色底** —— 不再是硬朗的 squircle 方块，而是柔和的正圆，底色偏淡。
2. **粗描边线条图标** —— 端点浑圆、内部留白大、像玩具轮廓。
3. **一处黄色实心小重点** —— 打破单色的呆板（磁带的黄标、光盘的黄唱针、收音机的黄按钮）。视觉活力全靠这一抹黄。

保留 BOOMER 红色主调，把上一版"红瓷方块 + 白色线条"改成"淡红圆底 + 品牌红粗线 + 一抹柠檬黄"。

## 视觉规范

- **Tile 容器**：从 `rounded-[26%]` squircle 改为 `rounded-full` 正圆；尺寸保持 54x54。
- **底色**：`bg-primary/10`（品牌红 10% 淡红），暗色模式下自动柔和；不再用实心红。
- **图标主色**：`text-primary`（品牌红），`stroke-width` 保持 2.6 圆头。
- **黄色重点**：新增 CSS token `--accent-warm`（#F5C43C 柠檬金），Tailwind 加 `accent-warm` 颜色。每枚图标预留一颗/一段 `fill="hsl(var(--accent-warm))"` 的实心小元素（圆点/一小段/一小块）。
- **阴影**：极轻 `shadow-[0_2px_6px_-4px_rgba(0,0,0,0.15)]`，比方块版更漂浮。
- **拖拽/编辑抖动/长按**：完全沿用现有 `AppGrid` 逻辑，不改动。

## 16 枚图标的"黄色重点"分配

| id | 图标 | 黄色小重点 |
|---|---|---|
| scan | 相机 | 中心镜头圆点 |
| marketing | 场记板 | 顶部拍板铰链圆点 |
| activities | 喇叭 | 喇叭口一颗音符点 |
| community | 四芒星 | 中心圆点 |
| library | 打开的书 | 中缝上一颗小书签点 |
| my-kb | 书+书签 | 书签末端小圆 |
| vouchers | 票 | 中间星星 |
| schedule | 日历 | 今日格子（右上一枚小方块） |
| checkins | 日历+勾 | 对勾本身（描边红 + 一颗黄圆点） |
| sop | 文档 | 卷角三角 |
| qa | 问号 | 下方问号圆点 |
| okr | 靶心 | 中心圆点 |
| notifications | 铃铛 | 铃铛底部小圆珠 |
| me | 人像 | 头顶一颗高光点 |
| more | 三点 | 中间一颗改黄 |

## 落地

1. `src/index.css` 加 `--accent-warm: 45 90% 60%;`（柠檬金 HSL），`tailwind.config.ts` 的 `theme.extend.colors` 加 `'accent-warm': 'hsl(var(--accent-warm))'`。
2. 改 `src/components/home/BoomerAppIcons.tsx`：每枚 SVG 里把黄色重点从 `fill="currentColor"` 换成 `fill="hsl(var(--accent-warm))"` 并加 `stroke="none"`，其余描边继续 `stroke="currentColor"`（= red）。
3. 改 `src/components/home/AppGrid.tsx` 的 `TileFace`：
   - `rounded-[26%]` → `rounded-full`
   - `bg-primary` → `bg-primary/10`
   - `text-white` → `text-primary`
   - 阴影降级为极轻款
   - 拖动放大动效保留
4. `appIconRegistry.ts` 的 `tone` 字段本轮**保持不动**（继续声明为 `'red'`），但语义变了——不再决定色相反差，仅作为未来扩展预留。可以顺手把注释更新，说明"当前所有 tile 统一使用淡红圆底 + 红粗线 + 黄色小重点"。

## 影响文件

- `src/index.css`（加 1 个 CSS 变量）
- `tailwind.config.ts`（加 1 个颜色 token）
- `src/components/home/BoomerAppIcons.tsx`（16 处黄色小重点着色）
- `src/components/home/AppGrid.tsx`（`TileFace` 4 行样式）
- `src/components/home/appIconRegistry.ts`（仅注释）

## 不动

- 拖拽/编辑/长按/添加/隐藏
- 顶栏 wordmark、底部胶囊、Boomer 主形象
- 图标之外的任何页面

## 视觉自检

生成后我会用 Playwright 截首页 `AppGrid` 区域，确认：
- 圆形底 vs 图标粗细比例协调
- 每枚黄色重点都可见但不喧宾夺主
- 与顶栏 red wordmark、Boomer 头像放在一起风格连贯