# 首页仪表盘重构 & 视觉瘦身 v3

## 1. 阴影瘦身（全局）
- 移除 `shadow-hard` / `shadow-2xl` / `shadow-strong` 等大阴影，统一改用 `border border-border` + `shadow-sm`（悬停可 `shadow-md`）。
- 影响面：`Home.tsx`、`BottomTabBar.tsx`（去掉大投影，仅保留胶囊描边 + 极轻 shadow-sm）、`FloatingDashboard`、卡片类组件。
- 保留：主 CTA 按钮的红色轻 ring（品牌识别用），不属于大阴影。

## 2. 命名 & 入口修正
- 底部导航「官方知识」→ **「知识库」**。
- 「我的知识」入口**同时保留两处**：
  - 「我的」页保持不动（原入口继续在）。
  - 新增到首页仪表盘的应用图标网格里。
- 「我的」页**保持现状不改**（用户明确要求）。

## 3. 顶栏统一
- 每个二级页面的顶栏：**左＝页面名称，右＝BOOMER-OFF 红色 logo**（用户之前上传的红色 logo）。
- 复用现有 `PageHeader` 组件，右侧统一挂 logo；首页不用 PageHeader，走自定义 hero。

## 4. 首页仪表盘重排（`Home.tsx` 全量重写）

```text
┌─────────────────────────────────────────────┐
│ 你好，{昵称}                    [⚡ 快速打卡] │  ← 问候 + 右侧小按钮（inline）
│ {每日 AI 鼓励语一句，随机}                    │
├─────────────────────────────────────────────┤
│  ▓▓▓▓▓ Banner 横幅（通知/新闻/默认海报） ▓▓▓▓ │
├─────────────────────────────────────────────┤
│  我的排班                                    │
│  [今日 09:00-18:00 · 门店 X]                 │
├─────────────────────────────────────────────┤
│  应用                              [编辑]    │
│  🔍AI识物  📚知识库  🎟券包  🎬营销         │
│  💬中古圈  📖我的知识  📅排班  ⚙更多         │
├─────────────────────────────────────────────┤
│  门店活动                                    │
│  [活动卡列表]                                │
└─────────────────────────────────────────────┘
```

### 4.1 问候区（顶部）
- 左：`你好，{staff_profiles.nickname || profile.name}`。
- 右侧内联小按钮：**「⚡ 快速打卡」**（size sm，红底白字，圆角胶囊），点击直接调 `check-in` RPC，成功 toast，不弹全屏。
- 下方一行小字：AI 生成的每日鼓励语。
  - 新增 `daily_encouragement` 表（date 唯一）+ edge function `generate-daily-encouragement`（Lovable AI，google/gemini-3-flash-preview，20 字内）。
  - 前端按当天日期 select，命中则直出；未命中则调 fn 生成并写回。
  - 员工侧一天只显示一句，不同员工共享同一句。

### 4.2 Banner 横幅
- 组件 `HomeBanner.tsx`：横向 16:6 图片轮播（swipeable）。
- 数据源：`notifications` 表新增字段 `banner_image_url`（nullable）+ `show_on_home_banner boolean`；或复用现有 notifications，`category = 'banner'` 的展示。
- 空态：显示默认海报（`src/assets/banner-default.jpg`，AI 生成一张 BOOMER GO 品牌调性横幅）。
- 点击跳到 `/notifications/:id`。

### 4.3 我的排班
- 复用现有 `shift_schedules` 查询，抽成 `HomeShiftCard.tsx`：只显示今天 + 明天的班次，无排班则「今日休息」。

### 4.4 应用图标网格 `AppGrid.tsx`
- 4 列图标网格（Lucide 图标 + 中文名，图标底 44×44 圆角方块，纯色底+图标，无大阴影）。
- 全量图标池（可自定义显隐 & 排序）：
  - AI 识物、知识库、我的知识、我的券包、营销中心、中古圈、排班表、每日打卡、员工手册、门店活动、通知、我的
- **默认显示**（8 个）：AI识物 / 知识库 / 我的券包 / 营销中心 / 中古圈 / 我的知识 / 排班表 / 更多
- **自定义方式（简版）**：
  - 长按任一图标进入「编辑模式」：图标微抖动，右上角出现「－」可隐藏；拖拽排序（用 `@dnd-kit/sortable`）。
  - 编辑模式末尾出现「+」，点开弹出 sheet 勾选未显示的图标加回。
  - 顶部出现「完成」按钮退出。
  - 用户偏好存 `localStorage` key: `boomer_go_home_apps_v1`（含 order + hidden 列表），不入库以减负。

### 4.5 门店活动
- 复用现有 `activities` 查询，抽成 `HomeActivitiesCard.tsx`，横向滚动卡片。

## 5. 需要新建/修改的文件

**新建**
- `src/components/home/GreetingHeader.tsx`
- `src/components/home/DailyEncouragement.tsx`
- `src/components/home/HomeBanner.tsx`
- `src/components/home/HomeShiftCard.tsx`
- `src/components/home/HomeActivitiesCard.tsx`
- `src/components/home/AppGrid.tsx` + `appIconRegistry.ts`（图标池 + 默认序）
- `src/lib/homeAppsPref.ts`（localStorage 读写 + 版本迁移）
- `src/assets/banner-default.jpg`（AI 生成）
- `supabase/functions/generate-daily-encouragement/index.ts`

**修改**
- `src/pages/Home.tsx`：全量重写为上面 5 段。
- `src/components/BottomTabBar.tsx`：`官方知识 → 知识库`；去掉大阴影，只留 `shadow-sm + border`。
- `src/components/PageHeader.tsx`：右侧统一挂红色 logo。
- 全局 `rg 'shadow-hard|shadow-2xl|shadow-strong'` 替换为 `border + shadow-sm`。

**DB migration**
```sql
create table if not exists public.daily_encouragement(
  date date primary key,
  text text not null,
  created_at timestamptz default now()
);
grant select on public.daily_encouragement to authenticated, anon;
grant all on public.daily_encouragement to service_role;
alter table public.daily_encouragement enable row level security;
create policy "read daily_encouragement" on public.daily_encouragement
  for select to authenticated, anon using (true);
-- 写入通过 edge function（service_role），不开放客户端 insert。
```

## 6. 验收清单
- [ ] 底部胶囊 & 首页卡片无「重阴影」，只剩描边 + 极轻阴影。
- [ ] 底部导航第 2 项文字为「知识库」。
- [ ] 首页顶部一行「你好 + 快速打卡」，下面一行鼓励语；打卡按钮体积小。
- [ ] 首页依次出现：问候 → Banner → 我的排班 → 应用网格 → 门店活动。
- [ ] 应用网格长按可排序 / 隐藏，勾「+」可加回，偏好持久。
- [ ] 二级页面顶栏右上角均显示红色 BOOMER-OFF logo。
- [ ] 「我的」页保持不动，「我的知识」在首页和「我的」都能找到。
