## 目标
1. **拖拽动效**：长按抖动已有；补齐拖起放大 + 邻近图标滑动挤压的 iOS 感觉。
2. **图标风格**：舍弃现在 15 种五彩渐变，统一走品牌红/白系，跟整站风格挂钩。
3. **右上角 wordmark**：换成透明背景 PNG。

## 方案

### 1. AppGrid 拖拽升级 (`src/components/home/AppGrid.tsx`)
- 引入 `DragOverlay`：拖起的那个 tile 用 overlay 渲染，附加 `scale-110` + 加深阴影，产生"抓起"手感。
- 原位 tile 变半透明占位（`opacity-30`），让空位可见。
- 让 `useSortable` 返回的 `transition` 生效（当前有传，但被 `zIndex` 覆盖时不明显）——显式加 `transition: transform 220ms cubic-bezier(0.2,0,0,1)`，其它 tile 让位时平滑滑动挤压。
- 保留 `wiggle-edit` 抖动；拖起的那一个暂停抖动（避免与 overlay 抖冲突）。
- Sensor 加 `delay: 120ms`，避免误触；`distance: 5`。

### 2. 图标品牌化 (`appIconRegistry.ts` + `AppGrid.tsx`)
换成"BOOMER GO 红瓷"体系，全部 tile 共用同一视觉语言：
- **默认 tile**：白色 squircle（`bg-white`）+ 极浅红描边（`ring-1 ring-primary/15`）+ 顶部高光 + 底部内阴影，图标为品牌红 `text-primary`，`strokeWidth={2.2}`。
- **主色 tile**（少量强调项，如 AI 识物、营销中心、门店活动 3 个高频入口）：品牌红实心 squircle + 白色图标，构成节奏。
- 移除 registry 里的 `gradient` 字段，改为 `tone: 'red' | 'white'`；由 `AppGrid` 内部统一渲染。
- 图标细节：`AI 识物` 保留 Camera；`BOOMER 圈` 换成 `Sparkles`（更贴品牌），其余图标视觉参数（描粗、尺寸 22px）统一。
- 结果：15 个图标风格一致，只用红/白两档，与顶栏 wordmark、底部胶囊栏、Boomer 主色形成统一。

### 3. 透明 wordmark（右上角）
- 用 `imagegen--edit_image` 基于现有 `boomer-go-wordmark.png` 做背景抠除，或直接 `imagegen--generate_image`（premium + transparent_background）重新生成"BOOMER GO"横排红字 wordmark。
- 走 `lovable-assets create` 生成新 pointer，覆盖 `src/assets/boomer-go-wordmark.png.asset.json`。
- `Home.tsx` 顶栏与 `PageHeader.tsx` 的引用不变（自动生效）。
- 保留旧 asset ID 到删除步骤之后（先确认新图正常再 `lovable-assets delete` 老的）。

## 不改动
- 抖动样式（用户明确说好）。
- 底部胶囊栏、路由、其它页面。

改动集中在：
- `src/components/home/AppGrid.tsx`
- `src/components/home/appIconRegistry.ts`
- `src/assets/boomer-go-wordmark.png.asset.json`（透明版覆盖）