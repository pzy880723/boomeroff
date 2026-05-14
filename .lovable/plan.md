# 排班 + 门店 SOP + 顾客 Q&A 模块

## 一、数据库（新增 5 张表）

```text
shop_shifts          班次定义（A/B/C…，可自定义）
  id, code(text唯一,如A/B/C), name(text), start_time(time),
  end_time(time), color(text), sort_order(int), active(bool)

shop_holidays        节假日设置
  id, date(date唯一), name(text),
  full_staff_off(bool 默认true 正式员工不上班),
  intern_works(bool 默认true 实习生上班)

staff_profiles       员工排班属性（user_id 唯一）
  user_id, employment_type('regular'|'intern'),
  weekly_workdays(int 默认5), available_weekdays(int[] 0-6 周日=0),
  preferred_shifts(text[] 班次code), max_per_week(int 默认5)

shift_schedules      具体排班记录
  id, work_date(date), shift_code(text), user_id(uuid),
  source('manual'|'ai'), note(text),
  created_by, created_at
  唯一: (work_date, user_id)
  索引: (work_date), (user_id, work_date)

shop_kb_categories   SOP/Q&A 分类（type 区分）
  id, type('sop'|'qa'), name, sort_order, created_by

shop_kb_entries      SOP/Q&A 词条
  id, type('sop'|'qa'), category_id(可空),
  title, body(text), tags(text[]), sort_order,
  created_by, created_at, updated_at
```

RLS：
- 全部表已认证用户 SELECT；
- shop_shifts / shop_holidays / staff_profiles / shop_kb_categories / shop_kb_entries 仅 admin 可写；
- shift_schedules：admin 全权；员工只能 SELECT 自己 + 当周全部（用于看同事）。

预设种子（迁移内 INSERT）：
- 班次：A 10:00–19:00、B 14:00–22:00（C 留空，管理员自行添加）
- SOP 分类：开店准备 / 收银 / 顾客接待 / 商品陈列 / 清洁维护 / 闭店流程 / 售后处理
- Q&A 分类：尺码版型 / 真伪鉴定 / 价格议价 / 退换货 / 保养清洗 / 库存调货 / 会员积分

## 二、"我的"页面改造（src/pages/Me.tsx）

1. 顶部资料卡右侧（用户上传图中红框位置）改为 **ShiftBadgeRight**：
   - 桌面/常规：与头像同行右侧；窄屏（< 360px）自动换到资料卡下方一行
   - 显示：
     ```
     今日 A 班  10:00–19:00
     明日 B 班  14:00–22:00
     ```
   - 未排班/休息显示"今日休息 / 明日 待排"
   - 数据来自 `shift_schedules` join `shop_shifts`，按 user_id + 今/明两天查询

2. 设置区（Card 列表）新增三个入口：
   - 店铺排班 → `/me/schedule`
   - 门店 SOP → `/me/sop`
   - 顾客 Q&A → `/me/qa`

## 三、新增前端页面

### `/me/schedule`（员工视图）
- 周历视图（本周 + 下周切换），按日列出班次和负责人
- 高亮自己；显示班次时间段 / 颜色
- 顶部"我的本周"汇总：上几天班、休几天

### `/me/sop` 和 `/me/qa`
- 左侧（移动端：顶部水平滚动）分类 Tab
- 右侧词条列表：标题 + 折叠展开正文，支持搜索
- 只读

## 四、后台 /portal 新增 4 个 Tab

在 `src/pages/Portal.tsx` MENU 数组追加：
- `shifts` 班次设置（CRUD shop_shifts + shop_holidays）
- `schedule` 排班管理（周历编辑 + AI 智能排班按钮）
- `sop` 门店 SOP（分类与词条 CRUD）
- `qa` 顾客 Q&A（分类与词条 CRUD）

排班管理面板：
- 顶部：周选择器 + "AI 智能排班"按钮 + "清空本周"按钮
- 表格：行=日期、列=班次 A/B/C，单元格选择员工（多选 chip）
- 员工属性入口（"员工排班设置"）：抽屉里编辑 staff_profiles（雇佣类型、可上班星期、偏好班次、每周上限）

## 五、AI 智能排班（Edge Function）

新增 `supabase/functions/generate-schedule/index.ts`：
- 入参：`{ week_start: 'YYYY-MM-DD', overwrite?: boolean }`
- 校验调用者为 admin（JWT）
- 拉取：shop_shifts / staff_profiles（含 user_id+display_name）/ shop_holidays（本周内）/ 已存在 shift_schedules
- 调用 Lovable AI Gateway（用 app_settings 中已配置的模型，默认 `google/gemini-2.5-flash`）
- System prompt 约束：
  - 节假日：full_staff_off=true 时正式员工不排，intern_works=true 时实习生正常排
  - 每人每周 ≤ weekly_workdays（默认 5），尽量做五休二
  - 仅在 available_weekdays 内排
  - 优先 preferred_shifts；同班次每天至少 1 人
  - 输出严格 JSON：`[{date, shift_code, user_ids:[]}]`
- 用 `Output.object` + zod 强制结构化输出
- upsert 到 shift_schedules（source='ai'），冲突按 overwrite 决定

## 六、技术细节

- 新增组件位置：
  - `src/components/me/ShiftBadgeRight.tsx`
  - `src/components/me/ScheduleWeekView.tsx`
  - `src/components/me/KbList.tsx`（SOP/Q&A 共用）
  - `src/components/admin/ShiftSettingsPanel.tsx`
  - `src/components/admin/ScheduleManager.tsx`
  - `src/components/admin/StaffProfileDialog.tsx`
  - `src/components/admin/KbManager.tsx`（type 参数复用 SOP/Q&A）
- 路由在 `src/App.tsx` 中加 3 个 me 子路由
- 时区：所有"今日/明日/本周"用 Asia/Shanghai 计算（沿用项目里 `todayShanghai` 做法）
- 文案 100% 中文，禁止"主播"，员工统称"店员"

## 七、不做的事

- 不接入任何排班抓取/外部日历同步
- 不做考勤打卡、工时统计（仅排班展示）
- 不为店员开放新增 SOP/Q&A 词条（仅 admin）

