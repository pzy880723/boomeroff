# 营销中心 v2:Banner 入口 + 返回键 + UI 升级

## 1. Me 页:Banner 主入口(在个人信息卡下方)

把原来藏在「设置列表」里的「营销中心 · 一键出片」一行,升级为独立 Banner Card,插入位置在 `Profile Card` 与 `CheckInCard` 之间(也就是个人信息正下方),原列表里的那一行同时移除,避免重复。

视觉规格:
- 高度比普通 Card 稍高(p-5),圆角 `rounded-2xl`
- 背景渐变:`bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10`,带极淡的网格底纹
- 左侧大图标圆胶囊:`Clapperboard`,渐变填充
- 标题:**营销中心**,副标题:**一键出图 · 一键出文 · 一键出片**
- 右下角 3 个小 Pill:📷 修图 · ✍️ 文案 · 🎬 视频
- 右上 `BOOMER` 小标(`Sparkles` 图标 + "AI 助手"小字)
- 点击整卡跳转 `/me/marketing`,带轻微 hover/active 缩放(`active:scale-[0.99]`)

## 2. 返回键:把 4 个页面的导航闭环补齐

- `MyMarketing.tsx` 顶部 PageHeader 增加 `back="/me"` —— 这是用户反馈"没有返回键"的根本原因。
- 子页面已经有 `back="/me/marketing"`,本次不动。
- 同时给整个营销系列加一个**统一面包屑色带**(可选)用 PageHeader 的 `subtitle` 表达当前位置,例如「图片优化」副标题写「营销中心 / 修图」。

## 3. MyMarketing 主页 UI 升级

当前问题:就是「一个统计卡 + 三个普通行 Card + 素材库」,信息密度低、缺乏层次。

重做版面:

```text
[ 顶部 Hero ]
  渐变背景 + BOOMER 小水獭剪影 + 今日产出徽章 + 近 30 天数值
  「今天发了吗?」一句鼓励文案,基于 counts 是否为 0 切换

[ 三大工具:卡片网格 ]
  ┌────────────┬────────────┐
  │ 修图        │ 写文案      │
  │ (大图标 + 步骤数 1)        │
  ├────────────┴────────────┤
  │ AI 视频(横向占满,占两列)  │
  │ 步骤数 2 · "脚本先确认再渲染"│
  └─────────────────────────┘
  - 卡片用 magic-card 风格:hover 时 spotlight 跟随光标
  - 每张卡片有「最近 1 张产出缩略图」(若有),没有就显示渐变占位
  - 右上角小数字 Badge = 30 天产出条数

[ 工作流提示带 ]
  一行三步指引:① 拍图/上传 → ② 修图/写文 → ③ 选平台发布
  弱化为提示色,不抢主视觉

[ 底部:素材库 + 品牌信息预设说明 ]
  素材库改成更明显的横长卡片(带最近 3 张缩略图叠加)
  品牌预设那句小字保留
```

样式锚点:
- 主色用 `hsl(var(--primary))` 渐变,符合现有 BOOMER 暖调
- 间距 `gap-3`,卡片 `rounded-2xl`,边框 `border-border/50`
- 微动效:卡片进入 `motion-safe:animate-fade-in`(已在 tailwind 里有的工具类)或 Tailwind 内置 `transition-all duration-200`

## 4. 子页面 UI 升级(轻量,只改观感不改逻辑)

### 4.1 MarketingPhoto(图片优化)
- 上方加一个**进度条**:`① 上传图 → ② 选修复项 → ③ 出图`,跟随状态高亮
- 原图/修复后对比从「左右两张方图」升级为 **Before/After 滑动对比**(纯 CSS,拖动分割线即可)
- 修复开关用更清晰的 `Switch` 替代 `Checkbox`,并加小图标
- 失败时不只 toast,在结果区放占位卡片 + 重试按钮

### 4.2 MarketingCopy(AI 文案)
- 顶部步骤条:`① 选图 → ② 平台/口吻 → ③ 生成 → ④ 复制发布`
- 平台用 4 个图标 Toggle Group(小红书 / 抖音 / 视频号 / 朋友圈),口吻用 Chip 风
- 生成结果三张卡片改成 **可滑动卡片堆叠**,每张卡有「复制标题 / 复制正文 / 复制全部」按钮
- 加「带去做视频」联动按钮(已经有 nav state,只是 UI 没暴露)

### 4.3 MarketingVideo(AI 视频)
- 顶部明显的 4 步进度条:`① 上传素材 → ② 检查充足度 → ③ 确认脚本 → ④ 渲染`
- 素材充足度检测结果用 **Alert + 缺失镜头清单**(红色 = 不够,黄色 = 建议补,绿色 = 充足)
- 脚本卡片每条镜头加缩略图 + 时长滑条 + 可编辑台词
- 渲染中给出 job 状态实时显示(已经 enqueue 了,只需查询)

### 4.4 MarketingLibrary(素材库)
- Tab 切换:全部 / 图片 / 文案 / 视频
- 用 `card-grid` 网格,每条带缩略图 + 创建时间 + 已发布平台徽章
- 长按/点 More 可删除

## 5. 技术细节

- 不新增依赖。Before/After 对比、Step Bar、Pill Tabs 全部用 Tailwind 手写。
- 不动 edge function、不动 RLS、不动数据库。
- 不动现有的 routes 配置,只编辑 5 个文件:
  - `src/pages/Me.tsx`(移除列表项 + 插入 Banner)
  - `src/pages/MyMarketing.tsx`(Hero + 网格 + 返回键)
  - `src/pages/marketing/MarketingPhoto.tsx`
  - `src/pages/marketing/MarketingCopy.tsx`
  - `src/pages/marketing/MarketingVideo.tsx`
  - `src/pages/marketing/MarketingLibrary.tsx`
- 颜色全部走 `hsl(var(--...))` 语义 token,不写裸色。

## 6. 验收

- /me 页:个人信息卡正下方出现彩色 Banner,设置列表里不再有「营销中心」这一行
- 点 Banner → /me/marketing,左上有 ← 返回箭头,回到 /me
- 4 个子页面顶部都有 ← 返回箭头,且每页都能看见清晰的步骤指引
- 整体观感统一(渐变 + BOOMER 调性 + 圆角 + 微动效),不再像「占位 demo」