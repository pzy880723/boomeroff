## 现状
- 表 `shop_kb_entries` / `shop_kb_categories` 已有，type='qa' 是顾客问答。
- 管理后台 `/portal → 顾客 Q&A` 已有 `KbManager`：支持新增分类/词条、AI 自然语言生成正文（自动匹配/新建分类）、编辑、删除。**这部分需求已经完成，无需重复造。**
- 前台 `/me/qa` 当前用 `MyKb`(共享组件) 显示为搜索 + 分类筛选 + Accordion 展开。

用户的两个核心诉求：
1. **把这份 BOOMER·OFF QA 标准导入到 顾客 Q&A**，并按内容自动拆字段、自动分类。
2. **前台改成"列表 → 点进详情"模块**，分类标签做匹配，比 Accordion 更清晰。
3. 管理员 AI 新增 / 编辑 / 删除 → 已存在，本次不重做，但顺手把 KbManager 里残留的"重复 entry dialog"代码块清掉（第 235-278 行是同一对话框的旧版重复，会导致双弹层）。

## 改动

### 1. 数据库 migration：导入 QA（idempotent）
- 在 `shop_kb_categories` 里插入 4 个分类（type='qa'）：
  - 商品属性
  - 价格与优惠
  - 活动与服务
  - 业务拓展
  - 用 `WHERE NOT EXISTS (... type='qa' AND name=...)` 避免重复。
- 在 `shop_kb_entries` 里插入 10 条词条（type='qa'），字段映射：
  - `title` = Q（去掉前缀"Q:"）
  - `body` = "**回答**\n\n{A 正文}\n\n**话术要点**\n- …\n\n**操作流程**（如有）…"，保持 Markdown 风格的纯文本（前端 `whitespace-pre-wrap` 已能呈现换行；加粗用 `**…**` 标记，详情页做轻量渲染）。
  - `tags` = 从内容抽取的关键词数组，如 `['Vintage','二手','成色']`、`['折扣','赠品']`、`['发票']` 等
  - `category_id` = 对应分类 id（通过 sub-select 取）
  - `sort_order` = 在分类内的顺序
- 不写 created_by（nullable，系统种子数据）、不写 shop_id（全店通用）。

### 2. 前台 `src/pages/MyQa.tsx` 改成独立组件（不再共用 MyKb）
布局：
```text
[搜索框]
[分类胶囊：全部 / 商品属性 / 价格与优惠 / 活动与服务 / 业务拓展]
[卡片列表]
  ┌──────────────────────────────┐
  │ 这里的东西都是用过(二手/旧)的么? │
  │ 我们是 Vintage 中古店，所以意…   │ ← 截断 2 行预览
  │ #Vintage  #二手   商品属性 ›    │
  └──────────────────────────────┘
  ...
```
- 点击卡片 → 打开 `Sheet`(右滑/底部抽屉，mobile 用 bottom，desktop 用 right) 详情页：
  - 顶部：分类徽章 + 标题
  - 正文：把 body 里的 `**xxx**` 渲染成加粗段标题，`- ` 渲染成项目符号；其他保留换行
  - 底部：标签 chips
- 搜索同时匹配 title / body / tags
- 分类切换 + 搜索都做客户端过滤，仍用现有 `shop_kb_entries` + `shop_kb_categories` 数据源
- 列表不再用 Accordion；详情用 Sheet 让阅读体验更聚焦

详情 Markdown 渲染：写一个 30 行的轻量 parser（按行切分；`**…**` → `<strong>`；以 `- ` 起头的连续行 → `<ul><li>`；其余 → `<p>`）。**不引入新依赖**。

### 3. KbManager 清理
删除 `src/components/admin/KbManager.tsx` 第 235-278 行的重复 entry Dialog（同一 state 渲染两遍，会同时出现两个弹窗）。仅此一处清理，不动 AI 生成 / 增删逻辑。

## 不动
- `generate-shop-kb` edge function
- `/portal` 路由与权限
- `MyKb`、`MySop` 继续使用旧 MyKb 组件（SOP 仍是 Accordion）
- 表结构

## 技术细节
- Migration 用一段 SQL 文件，分类先 INSERT，再用 `INSERT … SELECT … WHERE NOT EXISTS` 插词条；body 里包含中文双引号 / 换行 → 用 `$$…$$` dollar-quoted 字符串避免转义地狱。
- 详情 Sheet 用现有 `@/components/ui/sheet`；mobile 优先 `side="bottom"` + `max-h-[85vh] overflow-y-auto`。
- tags 关键词由我手动从原文挑 3-5 个/条；不调 AI，避免迁移时联网。
