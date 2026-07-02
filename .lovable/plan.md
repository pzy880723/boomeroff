# BOOMER GO 首页 & 导航 v3 微调计划

## 1. 底部导航瘦身圆润化 (`BottomTabBar.tsx`)

- **去文字**：AI 识物主按钮只保留图标 + 呼吸光晕，删除下方 "AI 识物" 文字（其他 4 个 tab 保留小字，因为需要区分）。
  - 可选进阶：全部 tab 都去掉文字，只保留图标（等待用户在评论回复决定，默认只删主按钮文字）。
- **降高压扁**：
  - 胶囊 padding：`px-2.5 py-2` → `px-2 py-1.5`。
  - 普通 tab：`py-1.5` → `py-1`，图标 `w-4 h-4` → `w-[18px] h-[18px]`。
  - 主按钮：`w-14 h-14 -mt-8 border-4` → `w-12 h-12 -mt-6 border-[3px]`，缩小 ring 光晕。
- **更圆润**：胶囊本身已 `rounded-full`；主按钮 border 由硬 4px 改成 3px + 更柔的阴影 `shadow-md`（替换 `shadow-hard`）。整条导航底部间距 `bottom-3` → `bottom-2`。
- 主按钮改成"凸起水滴"造型（顶部略突破胶囊、底部与胶囊融合）。

## 2. 首页应用网格 (`AppGrid.tsx` + 新建 `appIconRegistry.tsx`)

- **移除标题栏文字**：删掉 "应用" 二字，只在右上保留一个 `Pencil` 编辑小按钮（无文字）。
- **图标重设计**：为每个应用换一套统一视觉：
  - 圆角方形 tile 48×48 → 52×52，`rounded-2xl` 保留。
  - 底色改用品牌 tokens 派生的柔和背景：`bg-primary/8`、`bg-foreground/5`，图标本体统一用 `text-primary` / `text-foreground`，去掉现在各种彩色 tint。
  - 图标笔画 `strokeWidth={1.75}`，尺寸 `w-[22px]`，视觉上更精致、更"BOOMER GO"。
  - 每个 tile 加一层极淡的高光 `bg-gradient-to-b from-white/60 to-transparent` 提升质感。
- 保留长按编辑、拖拽排序、隐藏/添加逻辑，不改行为。

## 3. 门店活动改横向单条 (`Home.tsx`)

- **删除**当前 2 列 Card 网格。
- **新组件** `ActiveActivityStrip`：位于「我的排班」下方（原位置替换 AppGrid 之后的活动块 → 移到排班和 AppGrid 之间）。
- 视觉：一行横向条幅，左封面缩略（56×56 圆角），右侧标题 + 剩余时间，末尾 `ChevronRight`；无活动则整块隐藏。
- **只显示当前门店**：通过 `staff_profiles.shop_id` 过滤活动。
  - 由于 `activities` 表无 `shop_id` 字段，本次通过 `created_by` 与本店店员名单交集来判定（读取 `staff_profiles WHERE shop_id = 当前 shop_id` 得到 uid 列表，`activities.created_by IN (...)`)。
  - 标题改为「正在进行的活动」。
- 点击整条 → `/me/activities/{id}`；全部按钮跳 `/me/activities`。

## 4. Banner = 通知入口 + AI 生成图

- 首页 Banner 逻辑维持"取最新一条 banner 类通知"。
- **新增 Edge Function** `generate-notification-banner`：在 `Notifications.tsx` 管理员发布通知时，若未上传封面，则用 Gemini 3 Flash Image 依据 title/body 生成一张 16:6 横幅图并写回 `notifications.image_url`。
- `notifications` 表补 `image_url text` 与 `category text` 字段（migration）。
- 若生成失败，前端仍回退到 `bannerDefault`。

## 5. 门店 OKR / 培训列表（新模块）

- **数据**：复用现有 `operation_okrs` 表（已有 `shop_id / period_start/end / title / objective / key_results / tags`）。
- **首页新 Section**：位于「门店活动条」下方，标题「门店管理」+ "更多"。
  - 卡片列表样式参考美团经营宝：每行一条，左侧小图标（依据 `tags[0]` 或默认 `Target`）、中间 `title` + 一行 `objective`、右侧完成度百分比（`key_results` 中已完成占比）+ `ChevronRight`。
  - 最多展示 3 条当前周期内的 OKR（`period_start <= today <= period_end` AND `shop_id = 当前 shop_id`）。
- **详情页** `src/pages/OkrDetail.tsx`（新）：展示 objective、KR 列表勾选进度、key_actions。管理员可编辑（后续，先只读）。
- **列表页** `src/pages/OkrList.tsx`（新）：`/store/okr`，按周期分组，点击进详情。
- 添加进 `AppGrid` 注册表一个新图标「门店管理」→ `/store/okr`。

## 6. 技术细节

- 数据库迁移：
  ```sql
  ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS image_url text,
    ADD COLUMN IF NOT EXISTS category text;
  ```
- Edge Function `generate-notification-banner`：调用 `google/gemini-3.1-flash-image`，prompt = "为门店通知《{title}》生成 16:6 极简品牌横幅，朱红 + 米白配色，纪实风"；生成后经 Storage 上传拿公开 URL 更新记录。
- Home 数据请求追加 `staff_profiles.shop_id` 并二次拉店员名单用于活动过滤（并入现有 Promise.all）。
- 涉及文件：
  - `src/components/layout/BottomTabBar.tsx`
  - `src/components/home/AppGrid.tsx` + `appIconRegistry.tsx`
  - `src/pages/Home.tsx`
  - `src/pages/OkrList.tsx`（新）、`src/pages/OkrDetail.tsx`（新）
  - `src/App.tsx` 路由
  - `src/pages/Notifications.tsx`（发布通知时触发 banner 生成）
  - `supabase/functions/generate-notification-banner/index.ts`（新）
  - Supabase migration

## 交付顺序

1. 底部栏 + AppGrid 视觉（纯前端，立刻可见）。
2. 首页活动改横条 + 按门店过滤。
3. Notifications banner 字段 + Edge Function。
4. 门店 OKR 列表 & 详情页 + 入口。
