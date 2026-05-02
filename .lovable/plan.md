## 个人知识库页面改造

按你的要求重写 `/my-library` 页面，结构由上到下：

```text
┌─────────────────────────────┐
│ PageHeader「个人知识库」       │
├─────────────────────────────┤
│ 🌟 今日学习简报（AI 卡片）    │
│   🏪 全店动态：…             │
│   👤 给你的建议：…           │
│   [刷新]                     │
├─────────────────────────────┤
│ 我的知识与收藏  共 N 条       │
│                              │
│ ◾ 日瓷 (12)                  │
│   [格子 1][格子 2]…           │
│ ◾ 动漫玩具 (5)               │
│   [格子 1][格子 2]…           │
│ ◾ 奢侈品 (3)                 │
│   …                          │
└─────────────────────────────┘
```

### 1. 新增 Edge Function `supabase/functions/personal-daily-summary`
- 入参：当前用户 JWT
- 取数：
  - 全店最近 7 天 `products`（统计件数 + 品类 Top 5）
  - 当前用户 `user_favorites` + `product_knowledge`（统计件数 + 品类 Top 5）
- 调 Lovable AI（`gemini-2.5-flash-lite`，response_format json）生成两段：
  - `team_summary`（≤60字）：本周全店热点 + 重点关注品类
  - `personal_advice`（≤50字）：针对该店员收藏分布的一句具体建议
- 兜底：AI 失败时用纯统计文案。
- 缓存：写入 `app_settings` key = `personal_daily:{user_id}:{YYYY-MM-DD}`，当天再访问直接返回。`force=true` 时跳过缓存重新生成。
- 100% 中文、用「你」称呼，禁词「主播」。

### 2. 重写 `src/pages/MyLibrary.tsx`
- **顶部卡片**：调 `personal-daily-summary`，渲染全店动态 + 给你的建议；右上角刷新按钮。
- **数据合并**：
  - 拉 `user_favorites`（我所有收藏）
  - 拉 `product_knowledge` where `created_by = me`（我创建/申请的知识）
  - 统一映射成 `UnifiedItem`（区分 `kind: favorite | knowledge`），按 `created_at` 倒序合并
- **按品类分组渲染**：用 `Map<category, items[]>`，组内按时间倒序，组之间按数量降序；每组标题带图标、品类名、件数；**全部默认展开**，长滚动。
- **卡片**：保留原有 2 列网格 + 方形封面；左上角 Badge：
  - `kind=knowledge` → 「我建的」（primary）
  - `kind=favorite` → 「官方/识别/历史」（secondary）
- **详情弹窗**：复用原弹窗逻辑，回查官方/产品/自建知识。自建知识不显示「移除」按钮，提示请联系管理员。
- 兼容老数据：旧 selling_points 元素可能是 `{tag,text}` 对象，渲染时取 `.text`。

### 3. 不动的部分
- `useAuth`、布局、底部 tab 不变。
- `generate-daily-knowledge`（旧的 Header Popover「今日知识点」）保持不变。
- 数据库 schema 不动；缓存复用现有 `app_settings`（已有 RLS，service role 写入，读用 select 策略允许 authenticated）。

### 4. 验证
- 进入 /my-library：顶部卡片几秒内出现两段中文摘要；下面按品类分组列出收藏 + 自建知识。
- 收藏后刷新：新条目出现在对应品类下；点卡片能看到详情；从收藏移除后该卡消失。
- 当天再访问：摘要瞬间返回（命中缓存）；点刷新重新生成。
