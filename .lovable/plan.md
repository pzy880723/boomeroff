## 目标

1. 等级体系从 10 级扩到 **25 级**，账号当前 250 EXP 调到 **Lv.20 左右**
2. 经验只发给「店员」，**管理员操作不计经验**
3. 移除已废弃的"被收录到官方知识"经验
4. 签到经验大幅下调（日常小奖励）
5. 按操作难度重新定价，新增几条更贴合店员日常的经验来源

---

## 一、新 25 级阈值（前期易升、后期陡）

```text
Lv.1   中古萌新       0
Lv.2   入坑学徒       30
Lv.3   寻宝玩家       80
Lv.4   古物侦探       160
Lv.5   鉴货掌柜       280
Lv.6   行家里手       450
Lv.7   时代收藏家     680
Lv.8   中古名士       980
Lv.9   古董宗师       1360
Lv.10  一代藏圣       1840
Lv.11  鉴宝行家       2440
Lv.12  古玩通         3180
Lv.13  时光匠人       4080
Lv.14  藏界翘楚       5160
Lv.15  古今见证者     6440
Lv.16  万物鉴长       7940
Lv.17  古韵宗师       9680
Lv.18  典藏大家       11680
Lv.19  传世名匠       13960
Lv.20  古道掌门       16540   ← 当前 250 EXP 用户回填后落在这附近
Lv.21  鉴古真人       19440
Lv.22  千秋藏圣       22680
Lv.23  古界帝王       26280
Lv.24  万古传奇       30260
Lv.25  中古之神       34640
```

> 当前账号 250 EXP 在新表里只到 Lv.3。为达成"调到 Lv.20 左右"，**回填一次性补发** 16540 EXP（直接 UPDATE `user_experience.total_exp = 16540`）。

---

## 二、经验来源重构（仅店员）

### 改动方式
所有 `exp_on_*` 触发器内增加判断：**仅当 user 不是 admin 时才发经验**。
```sql
IF NOT public.has_role(_user_id, 'admin') THEN
  PERFORM public.add_experience(_user_id, _amount);
END IF;
```

### 新经验表（按难度分级）

| 行为 | 难度 | EXP | 备注 |
|---|---|---|---|
| **每日签到（基础）** | 极易 | **+3** | 原 +10 |
| 连签 3 天加成 | 易 | +3 | 原 +5 |
| 连签 7 天加成 | 中 | +10 | 原 +15 |
| 连签 30 天加成 | 难 | +30 | 原 +50 |
| AI 识别成功（每件） | 易 | **+5** | 原 +15，店员日常高频 |
| 加入个人知识库 | 中 | **+10** | 新增（手动"加入知识库"按钮） |
| 上传商品背款图/多角度图 | 中 | **+5** | 新增 |
| 完善个人知识卡（描述/卖点/小贴士齐全） | 中 | **+8** | 新增 |
| 在中古圈发帖 | 中 | +5 | 不变 |
| 帖子被点赞（被动） | 易 | +2 | 不变 |
| 帖子被评论（被动） | 易 | +3 | 不变 |
| 收藏官方/他人知识 | 极易 | **+1** | 新增，单日上限 5 次（防刷） |
| 通过个人知识测试 | 中 | **+15** | 原 +10，鼓励学习 |
| 提交识别纠错 | 中 | **+5** | 提交即给（鼓励反馈） |
| **纠错被管理员采纳收录官方** | 难 | **+30** | 取代旧"被收录到官方知识"，挂到 review-correction 通过时 |

### 删除项
- ❌ 旧 `exp_on_official_insert` 触发器（"被收录到官方知识"）→ 删除，逻辑迁移到「纠错被采纳」由 `review-correction` 边缘函数显式调用 `add_experience`

---

## 三、防滥用 / 防刷

- 收藏经验：在 `exp_on_favorite_insert` 中做单日上限（查当日 favorite 计数 ≥5 则跳过）
- 点赞/评论被动经验保留"作者 ≠ 操作者"判断
- 所有触发器统一加 `NOT has_role(user, 'admin')` 闸门

---

## 四、技术实现

### 1. 数据库迁移（一次 migration）
- 改 `LEVELS` 不涉及 DB（前端常量）
- DROP 旧 `exp_on_official_insert` 触发器与函数
- 重写 `exp_on_product_insert` / `exp_on_post_insert` / `exp_on_like_insert` / `exp_on_comment_insert` / `exp_on_test_pass` / `perform_check_in`：注入 admin 闸门 + 新数值
- 新增 `exp_on_favorite_insert` 触发器（带每日上限）
- 新增 `exp_on_knowledge_complete`（在 product 行 description+selling_points+tips 全非空且首次满足时给 +8，用 trigger AFTER UPDATE）

### 2. 边缘函数
- `supabase/functions/review-correction/index.ts`：审核通过时显式 `add_experience(submitter_id, 30)`

### 3. 前端
- `src/lib/level.ts`：把 `LEVELS` 改成 25 级表，更新 `EXP_RULES` 文案
- `src/components/me/LevelCard.tsx`：drawer 滚动列表已支持，无需改结构
- 「我的」页若展示进度环 / 顶级提示，自动适配

### 4. 一次性数据回填
- 调用 insert 工具：`UPDATE public.user_experience SET total_exp = 16540 WHERE user_id = '30484a83-bb55-4aa9-b97a-c0418e08f236'`

---

## 不在本次范围

- 不动 `app_role` 枚举
- 不动签到 RPC 的连签判定逻辑（只调数值）
- 不重置历史经验（除上面那一条手动回填）
