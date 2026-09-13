# BOOMER GO 收尾：只读核查结论（超时预算 + 收藏/练习语义）

全程只读。未改 schema、权限、租约开关，未部署，未恢复任何旧任务，未写入任何成绩。

## A. 当前可用性（核查受限，如实说明）

- 后端数据平面此刻不可达：数据库连接池返回 “pooler unavailable”，`cloud_status` 探测超时，
  直连 psql 报 `authentication query failed: connection to database not available`。
  Auth 健康端点连续 10 次返回 401（服务在，但库侧未就绪）。
- 因此本轮**无法**取到最新失败聚合、阶段耗时，也无法做匿名统计查询。
- 日志侧：`erp-scope-sync` 在当前可查询的保留窗口内**没有任何请求记录**（0 条 edge 日志、
  0 条函数日志），与 9 月 8 日之后未再真机触发/日志已过保留期一致。
  9 月 8 日那两次的既有证据仍成立：函数总耗时 9.0s / 10.2s，成功轮次 4~6s，
  失败即 8s pull 预算被 abort。

待库恢复后需补跑的只读项（本轮未做）：按小时聚合 `erp-scope-sync` 的
`execution_time_ms` 分位数与 `>8000ms` 占比、`erp_user_links.sync_error` 的匿名计数。

## B. 超时预算的结构性问题（代码可证）

- GO 侧：`supabase/functions/_shared/erp-http.ts` + `erp-scope-sync/index.ts`，
  `ERP_TIMEOUT_MS = 8000` 覆盖「握手 + 完整 body 读取」，超时归为 `erp_timeout`，
  不写镜像、不续租（fail-closed 正确）。
- ERP 侧按你的说明：在这一个请求内**串行**执行 GO `auth.getUser`（8s）
  + `erp_verify_current_scope_v1`（8s），上游最坏 16s。
- 结论：上游最坏预算（16s）> 下游总预算（8s），只要任一段变慢就必然被 GO abort。
  这不是偶发抖动，是预算倒挂；30 秒轮询下会周期性复现。

### 最小可验证修复建议（不实施，不放宽权限）

1. **ERP 侧为主**：把两次校验并行化，或合并为一次，并给整个 authorization 处理
   设一个**总预算 ≤ 5s**（单段 2~2.5s）。这是唯一能让预算不倒挂的根治点。
2. **GO 侧为辅**：pull 超时 8s → 12s，并对 `timeout`/`unreachable` 做**一次**立即重试；
   失败仍然 pending、不写镜像、不续租。
3. **可验证性**：在 `erp_scope_sync_pending` 日志补 `phase`（pull/ack）与 `elapsed_ms`
   （无 token、无个人数据）；ERP 侧记录 `$request_time`/`$upstream_response_time` 与 499。
   验收标准：连续 60 轮 30 秒刷新中 `erp_timeout` = 0，p95 < 3s。
4. 明确不做：不让客户端使用过期权限、不延长租约、不降低任何校验。租约保持 OFF。

## C. user_favorites 语义

`user_favorites(user_id, source_type CHECK IN ('official','product','recognition'),
source_id, snapshot, UNIQUE(user_id, source_type, source_id))`，仅本人 select/insert/delete 的 RLS。
`source_id` 无外键约束，`product` 与 `recognition` 两种 source_type 的 `source_id`
在应用层均指向 `products.id` —— 与你的理解一致，二者靠 `source_type` 区分用途，不靠不同表。

## D. knowledge_test_results 与 passed_at

- 表：`UNIQUE (user_id, item_kind, item_id)`，`passed_at timestamptz NULL`，
  索引 `(user_id, passed_at)`。唯一键与原生 upsert 的 `onConflict:'user_id,item_kind,item_id'` 匹配，仍有效。
- **PostgREST upsert 只更新请求体里出现的列**：它生成
  `INSERT (仅提交的列) ... ON CONFLICT (...) DO UPDATE SET` 同样这批列。
  省略 `passed_at` ⇒ 该列不出现在 SET 中 ⇒ **既有通过时间原样保留**，不会被清空。
  新行插入时 `passed_at` 取默认 NULL，符合「失败练习不算通过」。
- 触发器：`exp_on_test_pass` 要求 `NEW.passed_at IS NOT NULL` 且与 `OLD` 不同才发经验；
  省略写法下 `NEW.passed_at = OLD.passed_at`，**不会重复发经验**，也不会撤销已发的。
  `exp_on_test_insert` 只在插入且 passed_at 非空时触发，不受影响。
- 当天完成：`useTasks.tsx` 按 `passed_at` 落在当天区间统计；保留原 `passed_at` ⇒
  当天通过后再练错，仍算当天完成。符合预期。
- **一处不一致（只读发现，未改）**：Web 端 `src/pages/MyLibrary.tsx` 的失败分支仍显式传
  `passed_at: null`，会把同一条记录的既有通过时间清掉。原生已改为省略；
  若要两端语义一致，最小改动是删掉 Web 那一行的 `passed_at: null`（本轮未动）。

ERP 新补录合同按你的安排在 ERP 项目确认，这里不涉及。
