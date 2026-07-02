## 1. 首页"我的排班"展示逻辑

现状：无排班时展示 `近期暂无排班` 占位卡（不是自动隐藏）。

改动：**当自己未来 30 天没有任何排班时，整个"我的排班"卡片不再展示**，避免占位噪音。当天/次日有班时才出现。

> 疑问：您也可以选择"永远保留占位、仅文案改成更友好的一句话"。默认按"直接隐藏"实现，若您想保留提示卡请告诉我。

## 2. 活动条幅补"去核销"按钮

首页 `正在进行的活动` 与 `我的活动`（`ActivitiesMine`）列表，右侧统一新增一枚小按钮：

- **有券**（`activity.voucher_id` 非空，目前所有活动都属于这种）→ 显示 **"去核销"**，跳转 `/me/vouchers`（该页含扫码核销入口，仅 `voucher.redeem` 权限可见按钮，无权限自动隐藏）。
- **无券**（未来若出现）→ 显示 **"去核销"**（不再显示"绑定"字样）。

同时，小红书探店活动左侧封面：若 `cover_url` 为空，用 AI 生成一枚小红书风格图标（红底白字 REDNOTE 风格 App icon，圆角方块），落在 `src/assets/icon-xhs-activity.png`，作为默认封面回退。其它活动继续使用现有 `bg-gradient-primary` 兜底。

## 3. "我的应用" 图标高级化（Apple 风）

在 `AppGrid.tsx` 的 Tile 图标容器上叠加更接近 iOS 26 App icon 的观感：

- 圆角由 `rounded-2xl` 换成 `rounded-[22%]`（squircle 观感）。
- 双层高光：顶部斜向 45° 白色高光 + 底部 5% 内投影，形成"液态玻璃"面。
- 图标颜色从 `currentColor` 改为白色，容器 tint 改为半径色轮渐变（如 `bg-[linear-gradient(160deg,#FF3B30,#FF6A5A)]`）。
- 增加 `shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)]` 立体投影。
- Registry (`appIconRegistry.ts`) 中每个 app 提供 `gradient` 配色（红/蓝/绿/紫/橙…），代替现在的浅 tint。

## 4. 首页去掉"门店手册"→ 换成"我的知识 / BOOMER 圈"切换瀑布流

删除 `Home.tsx` 中 `sopCats` 相关的加载与渲染。新增组件 `HomeFeedTabs.tsx`：

- 顶部 tab（分段控件）：**我的知识** | **BOOMER 圈**，默认"我的知识"，选择记忆到 `localStorage`。
- **我的知识 tab**：查 `user_favorites` + 收藏对应的 `official_knowledge` / `product_knowledge` 生成缩略图卡（沿用 MyLibrary 的取数逻辑），2 列瀑布流展示最近 10 条；右上角按钮 **"测试一下"** 跳 `/knowledge/test`（若无此路由则跳 `/me/library?test=1`，我实现时会先检查）。
- **BOOMER 圈 tab**：查 `community_posts`（按最新 10 条），2 列瀑布流；右上角按钮 **"发帖"** 跳 `/community?new=1`（Community 页已有 ShareToCommunityButton，我会加 query 支持自动打开）。
- 卡片点击进入对应详情页。空态给一句友好提示 + 直达"更多"链接。

## 5. 全局 "中古圈" → "BOOMER 圈"

在下述文件中把用户可见的 `中古圈` 替换为 `BOOMER 圈`（保留 DB 枚举、tag、内部 slug 不动）：

- `src/pages/Community.tsx`、`src/pages/public/PublicCommunity.tsx`、`src/pages/public/PublicScan.tsx`、`src/pages/public/PublicResult.tsx`、`src/pages/public/PublicAbout.tsx`
- `src/pages/Portal.tsx`
- `src/hooks/useTasks.tsx`（每日任务文案）
- `src/components/community/ShareToCommunityButton.tsx`、`src/components/dashboard/LiveStreamPanel.tsx`、`src/components/recognition/GuestProductCard.tsx`、`src/components/layout/PublicLayout.tsx`、`src/components/home/appIconRegistry.ts`
- `src/lib/level.ts`、`src/lib/imageThumb.ts`
- BottomTabBar / SEO title、meta description

## 技术细节

- 排班隐藏：在 Home 顶部 useEffect 拉取 `shift_schedules` 后置 `hasAnyShift` 标志，条件渲染整卡。
- 活动按钮：`VouchersMine` 已提供扫码核销入口；用户如无 `voucher.redeem` 权限，按钮直接不渲染（前端 `usePermissions().can`）。
- 图标 registry 类型扩展 `gradient?: string`，未提供时回落现在的 `tint`。
- 首页 feed 2 列瀑布流：`columns-2 gap-2` + 每卡 `break-inside-avoid`，避免上下断裂。
- "中古圈" → "BOOMER 圈" 通过 codemod 逐文件替换字符串字面量，代码 identifier（`community` / `circle`）保持不变。

## 待您确认

- **排班无排班时**：完全隐藏卡片（默认方案）还是保留友好提示？
- 首页 feed 卡片高度：**首屏只放 6 条**（3 行 × 2 列）够吗？多了会让页面很长。
