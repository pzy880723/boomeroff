# 每日打卡 & 等级体系升级方案

## 一、目标
1. 在「我的」顶部新增"每日打卡"卡片，店员每天点一下即可签到。
2. 提供「我的打卡」详情页：日历视图、连续天数、本月签到天数、累计天数、最长连签、近期签到时间列表。
3. 打通多维度经验值系统，并设计 10 级中古主题等级（从 Lv.1 到 Lv.10 满级），在「我的」实时展示当前等级、称号、经验进度。

## 二、数据库设计（迁移）

### 1. `user_check_ins` — 打卡记录
- `user_id` uuid，`check_in_date` date（同一天唯一），`checked_at` timestamptz，`streak` int（当时的连续天数快照），`exp_gained` int
- 唯一索引 `(user_id, check_in_date)`，防重复签到
- RLS：用户只能 select/insert 自己的记录

### 2. `user_experience` — 经验汇总（一行/用户）
字段：`user_id` (PK)、`total_exp` int、`current_streak` int、`longest_streak` int、`last_check_in_date` date、`total_check_ins` int、`updated_at`
- RLS：本人 select/update；所有人可 select（用于排行/展示称号）
- 提供 SECURITY DEFINER 函数 `perform_check_in()`：
  - 校验今日未签 → 计算 streak（昨日签过 +1，否则归 1）
  - 基础 +10 exp；连续 3 天额外 +5；7 天 +15；30 天 +50
  - 写 `user_check_ins`，upsert `user_experience`
  - 返回 `{ exp_gained, new_total, current_streak, level }`
- 提供 SECURITY DEFINER 函数 `add_experience(_user_id, _action, _amount)`：用于其他维度加经验，幂等校验由调用方做。

### 3. 经验事件来源（在已有触发器/调用点接入）
- **签到**：`perform_check_in` 直接写入。
- **识别商品入库**：`products` 表 AFTER INSERT 触发器 → +15 exp（recorded_by/created_by）。
- **加入官方知识库**（admin 创建 official_knowledge 来自用户上传的）：+30 exp 给 source product 的 created_by。
- **中古圈互动**：
  - 自己发帖 `community_posts` INSERT → +5 exp 给作者
  - 收到点赞 `community_likes` INSERT → +2 exp 给帖子作者（去重：同 user 同 post 不重复）
  - 收到评论 `community_comments` INSERT → +3 exp 给帖子作者
- **个人知识测试通过**：`knowledge_test_results` UPDATE 当 `passed_at` 由 null 变非 null → +10 exp

所有触发器走 `add_experience` SECURITY DEFINER 函数，统一更新 `user_experience.total_exp`。

## 三、等级体系（10 级，中古主题命名）

| Lv | 称号 | 累计经验门槛 |
|----|------|--------------|
| 1 | 中古萌新 | 0 |
| 2 | 入坑学徒 | 50 |
| 3 | 寻宝玩家 | 150 |
| 4 | 古物侦探 | 350 |
| 5 | 鉴货掌柜 | 700 |
| 6 | 行家里手 | 1200 |
| 7 | 时代收藏家 | 2000 |
| 8 | 中古名士 | 3200 |
| 9 | 古董宗师 | 5000 |
| 10 | 一代藏圣 | 8000（满级）|

工具函数 `src/lib/level.ts`：`getLevelInfo(totalExp)` 返回 `{ level, title, currentExp, nextExp, progress, isMax }`。

## 四、前端实现

### 1. 新组件
- `src/components/me/CheckInCard.tsx`
  - 显示今日是否已签、签到按钮、当前连续天数、总经验、等级
  - 点击触发 supabase.rpc('perform_check_in')，弹 toast "+10 经验，已连续 X 天"
- `src/components/me/LevelCard.tsx`（替换现有 Lv.1 假数据卡）
  - 等级、称号、进度条 `currentExp / nextExp`，满级显示"已达顶峰"
  - 副本说明每个维度获取经验的方式（折叠/Drawer）
- `src/pages/CheckInHistory.tsx`（新路由 `/me/check-ins`）
  - 顶部统计：连续 X 天 / 最长 Y 天 / 累计 Z 天 / 本月 N 天
  - 月历视图（用 `react-day-picker`，已在 shadcn Calendar 中），高亮签到日
  - 列表：最近 30 条，显示日期 + 签到时间 + 当时连签 + 获得经验

### 2. Me.tsx 改动
- 接入 `user_experience` 数据源，移除假数据 Lv.1
- 顶部加 `CheckInCard`
- 替换增长卡为 `LevelCard`
- 设置区新增"我的打卡 →"入口跳 `/me/check-ins`

### 3. 路由
`src/App.tsx` 注册 `/me/check-ins`。

## 五、技术细节
- 所有经验加成走 RPC/触发器，前端不直接 update `user_experience`，避免作弊。
- 触发器使用 SECURITY DEFINER + `set search_path = public`。
- `community_likes` 去重：同一 user 同一 post 不重复加经验（依靠表本身 unique 约束即可）。
- 已签到状态：前端通过查 `user_check_ins where user_id=me and check_in_date=today` 判断。
- 实时刷新：签到成功后本地 setState，无需订阅。

## 六、文件改动清单
- 新建：`user_check_ins`、`user_experience` 表 + RPC + 4 个触发器（migration）
- 新建：`src/lib/level.ts`、`src/components/me/CheckInCard.tsx`、`src/components/me/LevelCard.tsx`、`src/pages/CheckInHistory.tsx`
- 编辑：`src/pages/Me.tsx`、`src/App.tsx`
