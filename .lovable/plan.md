## 把"自动加经验"改成"任务-红点-去领取"

像游戏日常任务一样：店员做完事 → 浮窗胶囊出红点 → 打开仪表盘看到一张「今日任务」卡 → 一条条任务带「领取 +N」按钮 → 点了才进经验。没领的红点一直在。

### 现状盘点（要保留 / 要改）

数据库现在有 6 个 trigger 在「事件发生时直接 `add_experience`」：

| 触发器 | 现在加的经验 | 处理方式 |
| --- | --- | --- |
| `exp_on_product_insert` | 识别入库 +5 | **改为不直接加，写入待领取** |
| `exp_on_product_complete` | 商品资料补全 +8 | **改为待领取** |
| `exp_on_test_pass` / `exp_on_test_insert` | 通过 quiz +15 | **改为待领取** |
| `exp_on_post_insert` | 发圈 +5 | **改为待领取** |
| `exp_on_like_insert` (作者+2) | 被点赞 | 保留自动（被动收益，不适合做任务） |
| `exp_on_comment_insert` (作者+3) | 被评论 | 保留自动 |
| `exp_on_favorite_insert` (+1, 5/天封顶) | 收藏 | 保留自动（量太碎） |
| `perform_check_in` RPC | 签到 +3(+ streak) | 保留即时（用户主动点的，本身就是"领取"动作） |

新增"可领取"的不靠 trigger，纯按当日行为现算的任务（每日刷新）：

- **每日签到**（已有，沿用 `perform_check_in`，UI 复用现有按钮）
- **首次识别**（今天第一次识别成功 +5）
- **3 次识别**（今天累计 3 次 +10）
- **完成 1 次知识 quiz**（+15）
- **发 1 条中古圈帖子**（+5）
- **提交 1 条纠错**（+3，鼓励反馈）

每日任务不写表，纯查 `products` / `community_posts` / `knowledge_test_results` / `pending_corrections` 当天数据 + `task_claims` 看是否已领。

### 数据库改动

#### 1. 新表 `public.exp_pending`（事件型可领奖励）

```sql
CREATE TABLE public.exp_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,              -- 'product_insert' | 'product_complete' | 'quiz_pass' | 'post_insert' | 'correction_accepted'
  source_ref uuid,                   -- 关联 product_id / post_id / test_id
  amount int NOT NULL,
  title text NOT NULL,               -- "识别入库 · 海贼王手办"
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  UNIQUE (user_id, source, source_ref)  -- 同一事件不重复
);
CREATE INDEX ON public.exp_pending (user_id, claimed_at);
```

RLS：用户只能看自己的；INSERT 由 SECURITY DEFINER 函数控制，不开放直插。

#### 2. 新表 `public.task_claims`（每日任务领取记录）

```sql
CREATE TABLE public.task_claims (
  user_id uuid NOT NULL,
  task_key text NOT NULL,            -- 'daily_first_scan' | 'daily_3_scans' | 'daily_quiz' | 'daily_post' | 'daily_correction'
  claim_date date NOT NULL,
  amount int NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_key, claim_date)
);
```

#### 3. 改造 6 个 trigger 函数

把里面的 `PERFORM public.add_experience(...)` 改成 `INSERT INTO exp_pending(...)`，金额不变。`exp_on_like_insert` / `exp_on_comment_insert` / `exp_on_favorite_insert` 保持原样（被动 / 高频，不进任务流）。

#### 4. 两个 RPC

- `claim_pending_exp(_id uuid) RETURNS jsonb`：校验属主+未领，更新 `claimed_at`，调 `add_experience`，返回 `{ ok, amount, total_exp }`。
- `claim_daily_task(_task_key text) RETURNS jsonb`：服务端再校验一次条件（如 `daily_3_scans` 真的查 `products` 当日 ≥3），写 `task_claims`，调 `add_experience`，避免前端绕过。

#### 5. Realtime

`ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_pending`，让胶囊红点和卡片实时刷新。

### 前端改动

#### 新 hook `src/hooks/useTasks.ts`

并行查：
- `exp_pending` 未领取列表（事件任务）
- 当日 `products` / `community_posts` / `knowledge_test_results` / 纠错提交数 → 派生当日 5 个 daily 任务的"完成度 / 是否已领"
- `user_check_ins` 今日是否签到
- 订阅 `exp_pending` realtime

返回 `{ pendingEvents, dailyTasks, totalUnclaimed, totalClaimableExp, claim, claimDaily }`。

#### 浮窗胶囊红点

`FloatingDashboard.tsx` 里 `hasUnread` 改为 `useTasks().totalUnclaimed > 0`（消息红点拆开，已经在另一条规划里）。胶囊小角标显示数字（`9+` 封顶），可领经验时是金色 `bg-amber-500` 而不是红色——更"奖励感"。

#### 仪表盘新卡 `TaskCenterCard`

放在 `LevelProgressCard` 上面（最显眼）。两段：

```
┌─ 今日任务 (3/5)  可领 +28 ─┐
│ ✅ 每日签到            +3 已领 │
│ 🟡 完成 1 次识别  1/1  [领取+5]│
│ ⚪ 完成 3 次识别  1/3      │
│ ✅ 通过一次 quiz  [领取+15]   │
│ ⚪ 发一条中古圈   0/1      │
│                            │
├─ 待领取奖励 ────────────────┤
│ 识别入库 · 鸣人手办  [+5 领取] │
│ 资料补全 · 钢丝玩偶  [+8 领取] │
│ [一键领取全部 (+13)]           │
└────────────────────────────┘
```

- 每行一个领取按钮，点击调对应 RPC，乐观更新 + toast `"+5 经验已入袋"`。
- "一键领取全部"循环调 `claim_pending_exp`。
- 没东西可领时整张卡灰阶，文案"今天已经全部领完啦 🎉"。

`LevelProgressCard` 里的"识别入库 / 通过测试 / 每日签到" 3 个 CTA 保留，但金额标改"待领取"风格，避免和任务卡功能重复——或者把那 3 个 mini-CTA 移除，让任务卡承担引导职责。**倾向移除**，避免一屏两套引导。

### 不做的事

- 不改 `add_experience` 函数本身，不动等级阈值
- 不动被动型经验（被赞/被评/收藏）
- 不做"过期未领自动失效"——pending 永久保留，避免店员错过感到挫败
- 不做周任务/成就章，留给后续扩展

### 验收

1. 识别一个新商品 → 不再立刻加经验，胶囊出金色 `1` 角标。
2. 打开仪表盘 → "待领取奖励"出现一条"识别入库 · XXX +5 [领取]"。
3. 点领取 → 经验 +5，等级条动一下，角标 `0`，红点消失。
4. 当天扫够 3 个 → "完成 3 次识别"任务亮起 [领取 +10]。
5. 一键领取全部 → 串行调用，总经验正确，可能触发 `LevelUpWatcher` 弹升级窗。
6. 在 A 设备领取，B 设备的胶囊角标实时变 0（realtime）。
7. 不能重复领取（RPC 已有的 `claimed_at IS NULL` 校验 + UNIQUE 约束兜底）。
