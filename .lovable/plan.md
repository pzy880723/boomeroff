## 回退配色 + 点击领取烟花动效 + 错误文案

只改 `src/pages/public/PublicClaimByPhone.tsx`。

### 1. 配色回退到原始克制版
- 背景：保留深棕渐变 `#1a0f06 → #2a1808 → #3b2410`（不变）
- 去掉那些大面积的 amber 径向光晕、漂浮金粒子、旋转金环、玻璃卡片的金色描边
- 卡片回到 shadcn 默认 `<Card>` 样式
- 按钮回到 shadcn 默认 `<Button>`，不再用金色渐变
- 标题、Ticket 图标用 `text-amber-100/90`（原版色）
- Input/Label 回到 shadcn 默认

### 2. 保留的少量改动（上一轮 ok 的部分）
- Logo 居中显示在顶部（`@/assets/boomer-off-vintage-logo.png`，h-14）
- 文案去掉"探店"字眼：副标题 `输入活动报名时填写的手机号即可领取`，底部 `仅限通过审核的活动申请人领取`
- 整体垂直居中（`items-center justify-center`）

### 3. 点击领取的烟花动效
- 用户点击「立即领取」→ 立即触发烟花动画 → 同时调用 edge function
- 实现：用 `canvas-confetti` 库（轻量、零依赖、已是社区标准）
  - `bun add canvas-confetti @types/canvas-confetti`
  - 触发 2-3 波 confetti：中心爆裂 + 左右两侧斜射，金色/琥珀色系粒子，模拟烟花
- 如果 edge function 返回成功 → 烟花继续 + 跳转到 `/u/c/:short_code`
- 如果失败 → 不再触发额外烟花（首发的已经放出），显示错误

### 4. 错误文案
- 后端报错（包括"未找到"）统一友好提示：
  `不好意思，没有搜索到对应的优惠券，请检查您的手机号是否输入正确`
- 手机号格式错误的 toast 保留：`请输入正确的 11 位手机号`

### 不动的部分
- `voucher-claim-by-phone` edge function 不动
- 路由 `/q`、跳转目标不动
- 短信模板不动
