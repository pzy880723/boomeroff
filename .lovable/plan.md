## 目标

把「官方知识」从后台搬到前台：
1. 管理员在 `/library` 浏览时随手新增（悬浮 + 按钮，复用已有 `AiKnowledgeDialog`）。
2. 把简单的 Dialog 详情升级为**独立详情页** `/library/:id`，支持封面、图集、视频、富文本正文、小贴士、卖点等模块。
3. 详情页底部有「来测一测」入口，AI 自动出题，做完打分。

## 用户流程

### A. 前端新增入口
- 在 `/library` 页面右下角加一个仅管理员可见的 FAB（圆形按钮，Wand2 图标）。
- 点击直接打开现有 `AiKnowledgeDialog`，AI 对话生成 → 保存后刷新列表。
- 管理员同时拥有「编辑」入口：列表卡片上长按或点 ⋯ 菜单进入编辑模式（先简版：详情页里加管理员专用的「编辑」按钮跳到一个 EditPage 或重新打开 AI 对话续聊，本期只做：入口 + 详情页内「编辑封面/正文/视频」按钮，调用现有结构）。

### B. 详情页 `/library/:id`（新页面）
布局（移动优先，max-w-screen-md）：
1. **顶部 Hero**：封面大图（4:3），返回按钮、收藏按钮浮在上层。
2. **标题区**：名称、品类徽章、IP、年代·产地、浏览/收藏数。
3. **简介**：summary 一段话。
4. **视频**（若有 `video_url`）：HTML5 `<video>` 自适应宽度，封面图作为 poster。
5. **图集**（若有 `gallery` ≥1）：横向滚动缩略图，点开放大。
6. **正文 / 深度内容**（新字段 `body` markdown）：用 `react-markdown` 渲染。
7. **核心卖点**：图标列表。
8. **小贴士**：高亮卡片。
9. **底部「来测一测」按钮**：进入测验弹窗。
10. 管理员条件渲染「编辑」按钮（顶部右上），点击打开 `KnowledgeRichEditDialog`：可编辑名称/简介/视频URL/正文(textarea markdown)/封面/图集；保存到 `official_knowledge`。

### C. 测验功能
- 点「来测一测」→ 弹出 `QuizDialog`：
  - 首次打开调用 edge function `generate-knowledge-quiz`（输入：词条全部内容；输出：5 道单选题，每题 4 选项 + 正确答案 index + 解释）。生成结果缓存到 `official_knowledge.content.quiz` 字段，避免重复消耗。
  - 题目按一题一屏顺序作答，进度条显示「第 n / 5 题」。
  - 结束后展示得分（如「4 / 5 · 中古达人」）和每题正确答案+解释，提供「再考一次」（重新洗牌选项序）和「换一套题」（管理员可见，强制重新生成）。

## 技术实现

### 1. 数据库迁移
```sql
ALTER TABLE public.official_knowledge
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS body text;
```
（`gallery` / `content` 已存在；测验 JSON 存在 `content->'quiz'`。）

### 2. 路由
- `src/App.tsx` 加 `<Route path="/library/:id" element={<OfficialDetail />} />`。
- `src/pages/OfficialLibrary.tsx`：把 `openDetail` 从打开 Dialog 改为 `navigate(\`/library/${id}\`)`，删除原 Dialog；保留浏览数自增 RPC。

### 3. 新页面 `src/pages/OfficialDetail.tsx`
- 拉取 `official_knowledge` 单行 + 用户收藏状态。
- 渲染所有模块；管理员看到「编辑」按钮。
- 底部固定「来测一测」按钮（`sticky bottom-16` 兼容 BottomTabBar）。

### 4. 组件
- `src/components/library/QuizDialog.tsx`：调用 `supabase.functions.invoke('generate-knowledge-quiz', { body: { id } })`，渲染答题流程。
- `src/components/library/KnowledgeRichEditDialog.tsx`：管理员编辑 video_url、body(markdown textarea)、cover_url、gallery（粘贴 URL 列表），其它字段沿用 OfficialKnowledgeManager 的字段集合。
- `src/components/library/AddOfficialFab.tsx`：仅管理员可见的 FAB，点击挂载已有 `AiKnowledgeDialog`。

### 5. Edge Function `supabase/functions/generate-knowledge-quiz/index.ts`
- 验证 admin **或者任何登录用户都可生成**（题目对所有人有用，但保存到 `content.quiz` 仅 admin 可写；未登录不生成）。
- 入参：`{ id }`。先 select 词条，若 `content.quiz` 已存在且 `force !== true` 直接返回。
- 调用 Lovable AI Gateway `google/gemini-3-flash-preview` + tool calling，输出：
  ```json
  { "questions": [
    { "stem": "...", "options": ["A","B","C","D"], "correctIndex": 2, "explanation": "..." }
  ] }
  ```
- 若调用方是 admin，则把结果合并写回 `official_knowledge.content`。
- 普通用户拿到题目但不写库（或用 service role 写——选后者，避免每次都重生）。

### 6. 依赖
- 新增 `react-markdown`（小依赖，用于正文渲染）。

## 文件清单

数据库：1 个 migration（加 `video_url`, `body`）。

新增：
- `src/pages/OfficialDetail.tsx`
- `src/components/library/QuizDialog.tsx`
- `src/components/library/KnowledgeRichEditDialog.tsx`
- `src/components/library/AddOfficialFab.tsx`
- `supabase/functions/generate-knowledge-quiz/index.ts`

修改：
- `src/App.tsx`（加路由）
- `src/pages/OfficialLibrary.tsx`（FAB + 跳转详情、移除旧 Dialog）

## 不在本次范围
- 不做答题历史排行榜。
- 不做视频上传，仅支持外链 URL（YouTube/MP4 直链）。
- `gallery` 编辑器仅支持 URL 文本框，不做拖拽上传。
