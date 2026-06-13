# 让 BOOMER 不再"问来问去就那几句",测一测不再"考来考去就那几题"

## 一、对话预设问题(BOOMER 抽屉里的快捷气泡)

**现状**:`src/components/spirit/SpiritChatPanel.tsx` 里写死了 16 个 chip,每次随机挑 4 个。池子小+无时段/无分类配比,反复打开容易撞到同样几个。

**改造**:
1. **扩充话题池到 ~50 条**,按分类组织:
   - 排班/同事(今日/明日/本周/下周/调休/补班…)
   - 打卡/等级/经验(连续天数/距升级/月度统计/连击奖励…)
   - 情绪/打气/吐槽(累了/丧了/想被夸/想偷懒/被顾客气到…)
   - 中古冷知识(品牌史/年代/版本辨真/材质保养…)
   - 工作小帮手(嫌贵/砍价/搭配/退换/陈列/拍照角度…)
   - 朋友圈/文案(种草款/治愈系/搞笑款/节日款…)
   - 今日推荐(主推风格/品类/价格带…)
2. **每次抽 4 条且不重复分类**:用"分组洗牌 + 每组取 1"的策略,保证 4 个气泡来自 4 个不同主题。
3. **加时段倾向**:早上偏排班/打气,中午偏知识/文案,晚上偏复盘/鼓励(用 `new Date().getHours()` 给对应分类加权)。
4. **每次打开抽屉/刷新都重抽**:现在已经是这样,继续保持;再加一个"换一批 🔄"小按钮让你手动洗牌。

## 二、测一测(QuizDialog)题目多样化

**现状**:`supabase/functions/generate-knowledge-quiz/index.ts` 每个知识点只缓存 1 套(5 道)题。`official_knowledge.content.quiz.questions` 或 `app_settings` 里的 quiz_cache 命中后,后续每次都返回**同一套题**。只有管理员能点"换一套题"force 重新生成。

**改造**:把缓存从"1 套 5 题"升级成"题库池子",每次随机抽 5 道展示。

具体做法:
1. **缓存结构升级**:
   - `official_knowledge.content.quiz` 从 `{ questions: [5 道] }` 改为 `{ pool: [N 道, 累积式] , generated_at }`(向后兼容:旧的 `questions` 字段自动迁移到 `pool`)。
   - 同样规则应用到 `app_settings.quiz_cache:*` 的 favorite / knowledge。
2. **首次出题**:让 AI 一次性出 **10 道**(把 `make_quiz` 工具 `minItems/maxItems` 改成 10),写入 pool。
3. **后续每次进入**:
   - 如果 pool ≥ 10 → 直接从 pool 里**随机抽 5 道**返回(无 AI 调用,依然快)。
   - 如果 pool < 10 → 补齐:让 AI 再出 10 道,**追加**到 pool 末尾,然后随机抽 5 道返回。
4. **"再考一次"按钮**:已存在的客户端 `reset()` 不重新请求,会重复同一批题 → 改为重新调用 `load(false)`,让后端再随机抽一组(很可能是不同 5 题)。
5. **管理员"换一套题"**:保持 `force=true` 含义,改为**清空 pool + 重新生成 10 题**,而不是覆盖单套。
6. **去重 & 质量**:补题时把已有题干作为"已出过的题"传给 AI 系统提示,要求"避免与现有题目重复,角度要不同"。

### 数据迁移

无需迁移脚本:边读边迁。读到旧结构 `{ questions: [...] }` 时,代码内当作 `pool` 用,写回时统一成新结构。

## 技术细节

**前端文件**
- `src/components/spirit/SpiritChatPanel.tsx`
  - 把 `QUICK_CHIPS` 重写成 `QUICK_CHIPS_BY_CATEGORY: Record<Category, Chip[]>`,加 `pickChipsBalanced(n=4)` 做分组抽取 + 时段加权。
  - chip 区右侧加一个小"🔄"按钮,onClick 触发 `setChips(pickChipsBalanced())`。
  - 用 `useState` 持有当前 chips,首挂载时算一次。
- `src/components/library/QuizDialog.tsx`
  - `reset()` 改为 `await load(false)` 重新拉一组随机 5 题(不强制 force)。
  - 不再使用本地 `reset` 重排同一批。

**后端文件**
- `supabase/functions/generate-knowledge-quiz/index.ts`
  - 工具 schema `make_quiz` 的 `questions.minItems/maxItems` → 10。
  - 读取逻辑:`pool = content.quiz.pool ?? content.quiz.questions ?? []`。
  - 返回逻辑:`if (!force && pool.length >= 5) return shuffle(pool).slice(0, 5)`。
  - 不足时调用 AI 生成 10 道,传入"已出过的题干列表"做去重 hint,然后 `pool = force ? newQs : [...pool, ...newQs]`,写回 `content.quiz.pool`。
  - 同一逻辑覆盖 `favorite` / `knowledge` 在 `app_settings` 的缓存。

**不动的地方**
- 题型(四选一)、UI 样式、通过线、积分发放、`onAttempt/onPassed` 回调、taskProgress 流程,全部保持不变。
- BOOMER 形象/动画/抽屉布局不动,只动 chip 内容与抽法。

## 验收

- 连续打开 BOOMER 抽屉 5 次,4 个气泡的具体话题至少出现 3 种以上分类组合,不再每次都是"明天上班/朋友圈文案/今天主推"那一套。
- 同一个知识点连续考 5 次,5 道题的题干集合每次都明显不同(只要 pool ≥ 10 就一定不会完全一样)。
- 首次进入新知识点 → 触发一次 AI 生成 10 道(略慢一点,符合"出题中…"提示);之后每次进入都是秒开。
- 管理员点"换一套题"→ pool 被清空并重新出 10 道。