## /q 领取页仪式感重设计

只改 `src/pages/public/PublicClaimByPhone.tsx`，不动后端、不动路由。

### 1. 文案（去除"探店"字眼，改为通用入口）
- 标题：保留 `领取您的专属优惠券`
- 副标题：`输入活动报名时填写的手机号即可领取`
- 底部说明：`仅限通过审核的活动申请人领取，如有疑问请联系门店工作人员`
- 错误提示文案不动

### 2. 布局
- 整体由 `items-start mt-6` 改为 `items-center justify-center`，垂直居中下移
- 顶部居中放 Logo：`import logo from '@/assets/boomer-off-vintage-logo.png'`，高度约 56px，下方留 32-40px 间距
- 顺序：Logo → 标题区 → 卡片 → 底部说明

### 3. 配色（统一为"领取您的专属优惠券"那种暖金/琥珀色调）
- 背景：保留深棕渐变 `#1a0f06 → #2a1808 → #3b2410`，叠加多层 amber 径向光晕
- Logo、标题、Ticket 图标、按钮文字、说明文字全部用 `amber-100 / amber-200 / amber-300` 系列（与"领取您的专属优惠券"一致）
- 卡片：玻璃拟态 `bg-amber-50/5 backdrop-blur-md border border-amber-200/20`
- Input：透明底 + amber 描边 + amber 文字 + focus 时 amber-300 ring
- 按钮：`bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500` + 深棕文字 `#2a1808` + 金色阴影

### 4. 仪式感与动效
- Logo：`animate-fade-in` + 轻微下落
- 标题区/卡片：`animate-fade-in` 错峰出现（用内联 `animation-delay`）
- 背景：2-3 个 amber 径向光晕 `animate-pulse`（不同 duration & delay）
- Ticket 图标：外圈一道金色 SVG 描边圆环，`animate-[spin_12s_linear_infinite]`，内部图标静止
- 6-8 个金色小光点（绝对定位 + `animate-pulse` + staggered delay），营造粒子漂浮感
- 按钮：hover 时金色光晕加强 + 轻微 scale；提交中保留 spinner
- 领取成功跳转前可加一个 `scale-in` 收尾（可选，简单实现）

### 5. 技术细节
- 不新增 tailwind config，纯用现有 `animate-fade-in / animate-pulse / animate-spin` + 内联 delay/duration
- 不引入新依赖
- 不改 `voucher-claim-by-phone` edge function、不改 `/q` 路由、不改跳转目标

### 不动的部分
- 提交逻辑、手机号校验、错误处理、跳转 `/u/c/:short_code` 全部保留
- 短信文案、模板、edge function 不变
