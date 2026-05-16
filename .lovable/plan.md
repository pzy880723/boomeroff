## 目标

围绕"中古小精灵"的浮窗与抽屉做四处体验修复，全部是前端 UI 改动，不动后端与业务逻辑。

---

## 1. 抽屉右上角"叉叉"位置调整

**问题**：当前 `SpiritDrawer` 右上角关闭按钮（下箭头），位置贴在安全区顶部，和 Tabs（对话 / 仪表盘）切换条挤在同一行，视觉拥挤。

**改动**（`src/components/spirit/SpiritDrawer.tsx`）：
- 把关闭按钮挪到 **抽屉左上角**（与 Tabs 错开），换成 `X` 图标（"关闭"语义更明确）。
- 增大点击热区到 `w-9 h-9`，半透明灰底圆形，hover 加深。
- 仪表盘 Tab 底部"收起"按钮保留。

---

## 2. 悬浮头像气泡（"今天怎么样"等）溢出问题

**问题**：`FloatingDashboard` 把按钮 + 气泡塞进同一行 flex，气泡 `whitespace-nowrap` 没限宽，长句把整行撑出屏幕，小精灵被挤跑或文字看不全。

**改动**（`src/components/dashboard/FloatingDashboard.tsx`）：
- 拆开布局：外层 `div` 只放按钮；气泡用 `absolute` 锚到按钮**内侧**（右侧胶囊→气泡向左展开，左侧胶囊→向右展开）。
- 气泡加 `max-w-[min(220px, calc(100vw - BTN - 24px))]`、改成 `whitespace-normal break-words`，保留小尖角朝按钮方向。
- 气泡显示期间按钮保持原位、保持可见。

---

## 3. 主页悬浮头像再放大

**改动**（`src/components/dashboard/FloatingDashboard.tsx`）：
- `BTN` 常量 `88 → 104`。
- 微调徽标偏移避免贴边。

---

## 4. 取消"自动打开抽屉"，改为首次问候小弹窗

**当前行为**：每个 session 首次进入主页 700ms 后自动 `openDrawer()` → 直接弹整页抽屉，体验侵入。

**新行为**：
- 移除 "首次自动 openDrawer" 逻辑，`AUTO_OPEN_KEY` 改记"是否已问候"。
- 新建 `src/components/spirit/SpiritGreetingDialog.tsx`：
  - `Dialog` 居中小卡片，抽屉同款配色。
  - 左侧 `SpiritMascot size={96}`，右侧文案（小精灵口吻、**不写"右下角"**，因为浮窗可拖到左右两侧、上下位置也会变）：
    > 嗨～我是中古小精灵🌱
    > 我会一直在屏幕上陪着你～
    > 想问排班、聊聊天，或者让我帮你打打气，
    > **随时点我的头像**就能找我啦！
    > （我还能被你拖到顺手的位置哦）
  - 按钮："好的，知道啦"；右上角 `X` 也可关。
- `FloatingDashboard` 检测 `sessionStorage[AUTO_OPEN_KEY]` 未设 → mount 问候弹窗，关闭后写入 sessionStorage；不再 `openDrawer()`。
- 首屏初始 `labelText` 由 `'你好呀～'` 改为 `null`（问候已由弹窗承担），保留 30s 情绪彩蛋。

---

## 技术细节

```text
FloatingDashboard
├─ 按钮 (fixed, left=capsuleX, top=capsuleY, size=104)
│   └─ SpiritMascot
└─ 气泡 (absolute, 锚按钮内侧, max-w + break-words)

首次进入：
  if (!sessionStorage[AUTO_OPEN_KEY])
    <SpiritGreetingDialog onClose={() => set(AUTO_OPEN_KEY,'1')} />
```

---

## 验证

- 首次刷新：居中问候弹窗，不再直接进抽屉。
- 浮窗拖到左/右、触发气泡：气泡不溢出，小精灵始终可见。
- 抽屉打开：左上角 X 不挡 Tabs；仪表盘底部"收起"仍可用。
- 移动 440 宽：弹窗与气泡都不出屏。
