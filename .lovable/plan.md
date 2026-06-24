## 问题
选完渲染模型后,虽然 `modelId` 状态已经更新(并会真正传给后端),但界面上的反馈太弱:
- 在「就拍这条」弹窗里,`SeedanceModelPicker` 用 `compact` 单列模式渲染,选中卡片只多了一圈细 ring + 一个 16px 小勾,移动端很难一眼分辨。
- 没有 toast、没有按钮文案变化,用户点完不知道"到底选上没"。
- 上方的 `ScriptBody` 里虽有「模型 · Seedance 2.0 Pro」小 chip,但和 picker 距离远、字号小,不像确认。

## 改动(仅前端 UI/反馈,不动业务逻辑)

### 1. `src/components/marketing/SeedanceModelPicker.tsx`
- 选中态视觉加强:
  - 选中卡片背景从 `bg-accent/5` 改为 `bg-accent/10`,加 `shadow-sm`,边框加粗到 `border-2`。
  - 右上角勾从 16px 放大到 20px,加文字「已选」。
  - 未选卡片显式渲染一个空心圆占位,避免选中/未选高度跳动。
- 顶部小标题右侧实时显示「当前:{label}」,而不是写死的「Seedance 2.0 · 单段直出 ≤15s」(那行下移到副标题)。
- `onChange` 触发时调用 `sonner` 的 `toast.success(`已选 ${label}`)`,给即时反馈。
- 不可用(Mini)点击时 `toast(`${available_at} 开放`)`,告知原因(目前是静默无响应)。

### 2. `src/components/marketing/SurpriseVideoDialog.tsx`
- 在 picker 下方、按钮组上方加一行明确提示条:
  - 形如:`✓ 将使用 {label} · {resolution_default} · 最长 15s`,绿色细边框胶囊。
- 「就拍这条」按钮文案改为 `就用 {shortLabel} 拍`(Pro / Fast / Mini),让选择直接体现在 CTA 上。
- 移除/隐藏 `ScriptBody` 顶部那个重复的「模型 · …」chip,避免两处冗余。

### 3. `src/pages/marketing/MarketingVideo.tsx`
- 同步把脚本预览页的"开始渲染"按钮文案改为 `用 {shortLabel} 开始渲染`,口径一致。
- picker 上方加一个小标语「选择渲染模型(可随时切换)」,让用户知道这里是可交互的。

## 不改的部分
- 后端 `render-marketing-video` / `surprise-marketing-video` 已经正确接收 `model` 参数,无需改动。
- 模型清单 (`seedanceModels.ts`)、可用性、价格信息不变。
- 视频生成流程、分镜、拼接逻辑都不变。

## 验收
1. 在「惊喜一下」弹窗里点任意一张模型卡 → 立即弹 toast「已选 Seedance 2.0 Fast」,卡片明显高亮,按钮变成「就用 Fast 拍」。
2. 点 Mini(未开放) → toast「2026-06-25 开放」,选择不变。
3. 在 `/me/marketing` 脚本预览页同样有 toast + 按钮文案同步。
