
## 目标

把"门店 SOP"升级成"**门店手册**"——BOOMER·OFF 的品牌运营核心思想 + OKR 自驱手册,并按提供内容重写模块结构。

## 一、命名 & 路由

保留 `/me/sop` 路由(不改 URL,避免链接失效),但所有 UI 文案改为 **"门店手册"**:
- `src/pages/Me.tsx` 入口标签 → 门店手册
- `src/pages/MySop.tsx` title → 门店手册
- `src/pages/Portal.tsx` 后台 Tab → 门店手册
- `src/components/dashboard/MessagesPanel.tsx` "今日 SOP" → 今日手册

> DB 中 `type='sop'` 标识保持不变(数据迁移成本太高,只是个内部 key)。

## 二、数据模型(沿用现有 shop_kb_categories / shop_kb_entries)

按内容拆成 **5 个分类**,顺序固定:

| sort | 分类 | 说明 |
| --- | --- | --- |
| 1 | 品牌欢迎 | 欢迎语 + 主理人心态 |
| 2 | 核心模式与 OKR | 终极目标 O + KR1 陈列 / KR2 体感 / KR3 互动 |
| 3 | 五大核心区域 | 玩具动漫、数码音像、首饰、家居 DIY、翻筐乐 |
| 4 | 日常巡视流程 | 开店 / 营业中 / 闭店 三段 checklist |
| 5 | 执行原则与心态 | 三条总纲 |

每条 entry 用 Markdown 子集 body:`# / ## / **bold** / - 列表 / | 表格 |`。tags 用于关键词搜索。

通过 `supabase--insert` 工具批量 upsert(先按 type='sop' 清空再插入,避免和旧的零散 SOP 混在一起;或加 `source='boomer-manual'` 标记 — 推荐前者,旧的 sop 内容用户也没几条)。

## 三、前端重写 `src/pages/MySop.tsx`(不再复用 MyKb)

参考刚做的 `MyQa.tsx` 的"列表 + 详情 Sheet + 管理员 AI 新增/编辑/删除"模式,但布局更贴合"手册":

### 1. 顶部 Hero

```text
┌────────────────────────────────────┐
│  门店手册                          │
│  虽古但新 · 信任可见               │
│  国内首家标准化中古连锁品牌        │
└────────────────────────────────────┘
```
(slogan 取自手册抬头,排版风格用主色渐变 + 小字副标题)

### 2. OKR 概览卡(置顶,固定渲染)

读取"核心模式与 OKR"分类下的 entries,做成 3 张并排小卡:
- 🎯 O:沉浸式情绪体验空间
- 📊 KR1 陈列 / KR2 体感 / KR3 互动

点击 KR 卡 → 直接打开对应详情 Sheet。

### 3. 分类 Tab + 卡片列表

- 顶部分类 pill(全部 / 品牌欢迎 / OKR / 区域 / 巡视 / 原则)
- 搜索框(标题 + body + tags)
- 列表用 Card,**标题加粗**(`font-semibold`),展示分类徽章 + 2 行摘要 + tags

### 4. 详情 Sheet(底部抽屉,复用 MyQa 模式)

`renderBody()` 支持:
- `**bold**` → `<strong>`
- 行首 `- ` → `<ul><li>`
- 行首 `## ` → `<h3>`
- 行首 `| ... |` 连续行 → `<table>`(简易 Markdown 表格,用于 KR 执行标准表)
- 其它 → `<p>`

底部 tags chips。管理员显示编辑/删除按钮。

### 5. 管理员 AI 新增/编辑(魔法棒)

完全复用 `MyQa.tsx` 已有逻辑:
- `usePermissions().can('shop.kb.write')` 判断权限
- 顶部 `Wand2` 按钮 → 弹 Dialog(分类 / 标题 / AI 提示 / body / tags)
- AI 调 `generate-shop-kb` edge function,传 `{ type:'sop', topic, hint, categories }`
- 每张卡 Pencil/Trash2;详情 Sheet 内也提供编辑/删除
- 保存后刷新列表

## 四、内容种子(用 supabase--insert)

- 删除现有 `shop_kb_categories where type='sop'` + `shop_kb_entries where type='sop'`(用户当前 SOP 数据极少,新建更干净)。
- 插入上面 5 个分类。
- 插入 ~15 条 entries,正文严格按用户提供的手册 Markdown 切分;KR 部分保留 `| 维度 | 执行标准 |` 表格语法(由 renderBody 渲染)。

## 五、不动的部分

- DB 表结构、RLS、edge function、其它页面(MyKb 个人知识 / MyQa)。
- `type='sop'` enum 值;后台 Portal 的 KbManager 自动跟着改 title。

## 技术细节

- `MySop.tsx` 不再 `return <MyKb …/>`,改为独立组件(约 250 行),结构与 `MyQa.tsx` 对齐方便维护。
- Markdown 表格解析:遇到连续以 `|` 开头的行视为一段,首行 header,第二行若全是 `---` 跳过,其余为 body row,渲染成 Tailwind 简洁表格(`text-xs` / `border-border/40`)。
- 路由保持 `/me/sop`(避免 dashboard / 今日学习 deep link 404);所有可见文案改为"门店手册"。
- 数据迁移用 `supabase--insert`(纯 DML),不需要 migration。

## 验收

- 进 `/me/sop` 看到新标题"门店手册" + slogan + OKR 概览卡。
- 5 大分类 + 搜索 + 详情 Sheet 正常,KR 表格能渲染。
- 管理员账号能看到魔法棒 + 每条编辑/删除按钮,AI 生成新条目可保存。
- 普通店员账号只读,看不到管理按钮。
