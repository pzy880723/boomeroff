## 目标

按选中的"年鉴版·古铜烫金"方向,在不动现有配色 token 的前提下,把营销中心的 4 个页面整体重新设计,统一视觉语言、收紧信息层级、让交互逻辑更清晰。

## 视觉语言(贯穿 4 页)

- 字体:大标题 Cormorant Garamond serif(经 index.html 加载),正文继续用现有 Inter / 系统中文字体。
- 章节小标签:`text-[10px] uppercase tracking-[0.1em] text-accent`,前缀一个 4px 古铜金圆点。
- 卡片:`bg-card rounded-[0.875rem] shadow-sm border border-accent/10`,按下态边框变 `border-accent`。
- 数据分隔:细 `border-t border-border` 一条横线;指标用 label/value 上下两行,数字加粗。
- 步骤条:把现有 StepBar 升级为"古铜金细线串联 + 序号(01/02/03)"——完成态 = 深咖填充白字,当前态 = 白底古铜金描边,未来态 = 白底浅描边;细线在完成段为 `accent/60`。
- 底部 4px 高古铜金 `accent/20` 装饰条贴底。
- 不引入纸纹外链(felt.png),改用 CSS `radial-gradient` 极淡噪点,避免外网依赖。

## 页面级改动

### 1. `src/pages/MyMarketing.tsx`(营销中心首页)

- Hero 卡:白底 + serif 大标题"今天已经产出 N 条",下方一条细线分隔 + 横排 图片/文案/视频 指标 + 右下角 BOOMER `boomer-idle.png`(保持现有资产)。去掉原大色块渐变。
- 工具入口:
  - 第一行 2 列网格:图片优化、AI 文案——白卡 + 古铜金线性图标 + 角标计数。
  - 第二行整行:AI 视频——左侧 12×12 深咖图标块、右侧标题 + "15-30 SEC" small caps 标签 + 流程提示。
- 工作流提示带:3 个序号圆(01 拍图 / 02 产出 / 03 发布),古铜金细线串联,中间态高亮深咖。
- 素材库入口:白卡 + 堆叠缩略图(保留现有 recent 数据查询逻辑)。
- 底部说明:小写 caps 中文 + 古铜金强调句。

### 2. `src/pages/marketing/StepBar.tsx`

升级共享步骤条组件——序号改为 `01/02/03` serif、细线改为 `bg-accent/60`(完成)/ `bg-border`(未来)、当前态加 `ring-1 ring-accent/40`。所有 3 个子页面共用,保证视觉统一。

### 3. `src/pages/marketing/MarketingPhoto.tsx`(图片优化)

- 顶部 small caps 章节"Step · 修图工坊"。
- 上传区:虚线框升级为古铜金 `border-accent/40 border-dashed`、内嵌 serif "上传一张图片" + 小字 hint。
- 原图/修复后并列:加 `border-accent/10` 描边 + 顶部 small caps 标签"BEFORE / AFTER"(此处可以保留中文"原图 / 修复后",仅作为 11px small caps)。
- 修复开关卡:每行 checkbox + serif 小标题 + 11px 灰色描述,行间细分隔线。
- 主 CTA:深咖底古铜金描边,按下时阴影收紧。

### 4. `src/pages/marketing/MarketingCopy.tsx`(AI 文案)

- 平台/口吻区:把 Badge 换成"细描边胶囊",选中态 = 深咖底白字 + 古铜金 1px 阴影。
- 输入字段:`bg-transparent border-b` 编辑式下划线输入(更编辑器/年鉴感),`border-accent/30` focus 时变 `border-accent`。
- 候选卡:白卡 + 顶部 small caps "候选 01/02/03" + serif 标题 + 正文 + hashtag 古铜金。
- 复制按钮:右上角小图标按钮,不抢眼。

### 5. `src/pages/marketing/MarketingVideo.tsx`(AI 视频)

- 设置卡同 Copy:细描边胶囊 + 下划线输入。
- AspectPicker:重画为 3 个画幅缩略框,选中态古铜金描边 + 内填深咖 5%。
- 充足度结果卡:边框颜色保留语义(绿/黄/红),但弱化背景,改为 `border-2` + 顶部 small caps 标签 "素材诊断"。required 项用 ✓/✗ 古铜金/深红。
- 脚本 SceneRow:左侧缩略图圆角 + 右侧 serif "镜头 01"标题、文本下划线 input、底部小号 chip 切换图片。
- 主 CTA "确认脚本"沿用深咖按钮风格。

### 6. `src/pages/marketing/MarketingLibrary.tsx`(素材库)

- 顶部 small caps 月份分组(本月 / 上月 / 更早)。
- 列表卡:左侧 64×64 缩略图、右侧 serif 类型 + 11px 时间 + 截断正文;hover 古铜金边框。

## 技术细节

- 不改任何业务逻辑、edge function、数据表、上传链路。**只动 JSX 结构 + className + 少量 svg 图标**。
- 不引入新 npm 包。Cormorant Garamond 通过在 `index.html` 加 `<link rel="stylesheet">` 一行(非阻塞)+ `tailwind.config.ts` 给 `fontFamily.serif` 增加 `'Cormorant Garamond'` 别名 `font-serif-display`,仅营销中心使用。
- 旧 `UploadGrid` / `AspectPicker` 仅样式贴合新方向,保留 API。
- 全中文。BOOMER 品牌名 + 极少量 small caps 装饰英文(Step / Before / After / 15-30 SEC)允许出现,符合视觉但不承担信息;若你要纯中文我可以全替换。

## 变更文件

- `src/index.html`(加字体 link)
- `tailwind.config.ts`(加 `font-serif-display`)
- `src/pages/MyMarketing.tsx`
- `src/pages/marketing/StepBar.tsx`
- `src/pages/marketing/MarketingPhoto.tsx`
- `src/pages/marketing/MarketingCopy.tsx`
- `src/pages/marketing/MarketingVideo.tsx`
- `src/pages/marketing/MarketingLibrary.tsx`
- `src/pages/marketing/AspectPicker.tsx`
- `src/pages/marketing/UploadGrid.tsx`(仅样式)

## 不做的事

- 不动配色 token / index.css
- 不动数据查询、edge functions、表结构
- 不动底部 5 Tab 导航 / 其他页面
- 不替换 BOOMER mascot 图,沿用 `boomer-idle.png`