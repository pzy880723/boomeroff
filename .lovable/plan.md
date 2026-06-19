# 方案：店铺关联 + AI 店铺描述 + 素材按店铺管理

## 1. 营销中心默认店铺（自动关联 / 记忆）

修改 `useShops` 与各营销页（MarketingLibrary / MarketingPhoto / MarketingCopy / MarketingVideo）的店铺选择逻辑：

- 新增 `useDefaultShop()`：
  - 读 `staff_profiles.shop_id`（当前账号所在店铺）作为「默认店铺」
  - 读 `usePermissions().can('shop.write')` 或角色判断是否管理员
  - 优先级：`localStorage(marketing_last_shop)` → `staff_profiles.shop_id` → 第一个 shop
- 非管理员：店铺锁定为 `staff_profiles.shop_id`，UI 只显示店铺名（不显示切换器），无 `ShopPicker`
- 管理员：显示 `ShopPicker` 可切换；切换后 `rememberShop()` 写入 localStorage，下次进入直接用记住的值
- 进入营销页时无需再"先选店铺"，直接进入对应店铺的视图

## 2. AI 自动生成店铺描述

在 `ShopProfilePanel` 顶部新增「✨ AI 自动生成」按钮：

- 用户在 textarea 输入一段自然语言（如"我们是一家位于东京中野的中古玩具店，主打80-90年代日系玩具…"）
- 点击生成 → 调用新 edge function `generate-shop-profile`
  - 输入：自然语言文本 + 店铺名/地址
  - 用 Lovable AI（google/gemini-2.5-flash）生成结构化 JSON：tagline / description / selling_points[] / tone / target_audience / brand_keywords[] / default_hashtags[]
  - 返回后**填充到表单**（不直接落库），用户可手动微调后点「保存」
- 已有内容时生成会提示"将覆盖当前内容，是否继续"

## 3. 素材库手动上传 + 按店铺分类

`MarketingLibrary` 页面：

- 顶部：当前店铺显示（管理员可切换，员工锁定为本店）
- 三个 Tab：图片 / 文案 / 视频
- 每个 Tab 顶部新增「+ 上传」按钮：
  - **图片**：选本地图片 → 压缩 → 上传到 `product-images` bucket → 插入 `marketing_assets`(kind='photo', shop_id=当前)
  - **文案**：弹窗输入标题+正文 → 插入 `marketing_assets`(kind='copy', shop_id=当前)
  - **视频**：选本地视频 → 上传到 `marketing-videos` bucket → 插入 `marketing_assets`(kind='video', shop_id=当前)
- 列表项左侧已有缩略图（图片显示首图，视频显示首帧/封面，文案显示文本图标）—— 保持不变

## 4. 技术细节

新文件：
- `supabase/functions/generate-shop-profile/index.ts` — Lovable AI 调用，输出结构化 JSON
- `src/hooks/useDefaultShop.ts` — 默认店铺解析（包含 staff_profiles.shop_id + admin 判定）
- `src/components/marketing/UploadCopyDialog.tsx` — 上传文案
- `src/components/marketing/UploadVideoDialog.tsx` — 上传视频
- 复用 `uploadMarketingImages.ts` 做图片上传

修改：
- `src/hooks/useShops.ts` — 暴露 `useDefaultShop`
- `src/pages/marketing/MarketingLibrary.tsx` — 添加上传按钮 + 默认店铺逻辑 + 员工锁定 UI
- `src/pages/marketing/MarketingPhoto.tsx` / `MarketingCopy.tsx` / `MarketingVideo.tsx` — 同样改默认店铺逻辑（不再强制 ShopPicker，员工锁定）
- `src/components/marketing/ShopProfilePanel.tsx` — 新增"AI 自动生成"按钮 + 自然语言输入区

无数据库 schema 变更（沿用现有 `marketing_assets.shop_id`、`staff_profiles.shop_id`、`shop_marketing_profiles`）。
