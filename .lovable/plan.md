## 目标

把"个人知识"页顶部的**今日学习简报**改造成**今日测试任务**：每天给店员推送一批未通过测验的知识点，做完一次"出题→作答→通过"才算掌握，已通过的自动归档进**个人历史知识**，无需再测。完成度用一根百分比进度条直观展示。下方知识列表按品类分组，每张卡上加"测验"按钮供随时手动复习。

---

## 一、数据层（新建一张表）

新建 `knowledge_test_results`：
- `user_id` — 谁的进度
- `item_kind` — `'favorite'` / `'knowledge'`（个人收藏 vs 自建知识）
- `item_id` — 对应 `user_favorites.id` 或 `product_knowledge.id`
- `source_type` / `source_id` — 收藏来源（official / recognition / product）+ 原始知识 id，用于去重和回链
- `passed_at` — 通过时间（NULL = 未通过）
- `score` / `total` — 上次得分
- `last_attempt_at` — 最近一次答题时间
- 唯一约束：`(user_id, item_kind, item_id)`
- RLS：用户只能读写自己的记录

---

## 二、出题函数复用

现在的 `generate-knowledge-quiz` 只认 `official_knowledge`。把它扩展成接收：
- `kind: 'official' | 'favorite' | 'knowledge'`
- `id`：对应来源主键

函数内部分别从 `official_knowledge` / `user_favorites.snapshot` / `product_knowledge` 取知识点拼 prompt 出 5 道题。题目继续缓存（official 写回 content.quiz；favorite/knowledge 写到新建的 `app_settings` 行 `quiz_cache:{kind}:{id}`，避免污染表结构）。

**通过判定**：满分通关或正确率 ≥80% 视为通过 → 前端把结果写进 `knowledge_test_results`。

---

## 三、个人知识页（`src/pages/MyLibrary.tsx`）改版

### 顶部卡片：今日测试任务

替换原"今日学习简报"卡片：

```text
┌─ 今日测试任务 ──────────────[刷新]
│  已掌握 12 / 38            32%
│  ████████░░░░░░░░░░░░░░░░
│  今日推荐 5 条 · [开始测试]
│  · 明清官窑青花碗
│  · Sonny Angel ……
└──────────────────────────────
```

- **进度条**：分母 = 我的全部知识与收藏总数；分子 = `passed_at IS NOT NULL` 的条数。用 `<Progress />`（已存在）。
- **今日推荐**：从未通过的项里按"创建时间最早 / 最久没测"取 5 条。点 `开始测试` 依次走 QuizDialog；通过即标记并自动跳到下一条。
- 全部通过后显示"今日已全部掌握 🎉，明天再来巩固"，按钮变灰。

### 下方列表：按品类分组 + 归档区

把已加载的 items 拆成两组：
1. **未掌握**：仍按品类分组渲染（保留现有 UI），每张卡片右下角加 `测验` 小按钮（次要样式），点击直接对该条出题。
2. **个人历史知识**（已通过，默认收起 `<Collapsible />`）：同样按品类分组，卡片右上角换成 ✅ 徽章；点击仍可看详情，也可"再考一次"。

详情弹窗里也加 `去测验` 按钮。

### 状态联动

- QuizDialog 关闭时若 `passed`=true，本地 items 状态把该 key 标记为已掌握，不需整页重拉，进度条立即增加。
- 失败也写一行 `last_attempt_at`，下次"今日推荐"会优先排进来。

---

## 四、QuizDialog 调整（`src/components/library/QuizDialog.tsx`）

- props 增加 `kind` 和 `onPassed?: (score, total) => void`。
- `generate-knowledge-quiz` 调用时传 `{ kind, id }`。
- 答完后判断是否达通过线，调用 `onPassed`，由调用方写 `knowledge_test_results`。
- 完成页文案：通过 → "已掌握，自动归档到个人历史知识"；未通过 → "再练一次"。

---

## 五、删除/保留

- 旧的 `personal-daily-summary` 函数不再在该页调用，但暂不删除（其他位置可能引用，留给后续清理）。
- "今日学习简报"相关 state/UI 全部移除。

---

## 技术细节

```text
files:
  + supabase/migrations/...  -- 新建 knowledge_test_results
  ~ supabase/functions/generate-knowledge-quiz/index.ts  -- 支持 kind
  ~ src/components/library/QuizDialog.tsx                -- kind / onPassed
  ~ src/pages/MyLibrary.tsx                              -- 新顶部卡 + 进度 + 归档分区 + 卡片测验按钮
```

通过线设为 **正确率 ≥ 80%**（5 题 ≥ 4 对）。如需调成"满分才算通过"或别的值请告知。

---

确认后我会先发数据库迁移让你审批，再改前端与边缘函数。