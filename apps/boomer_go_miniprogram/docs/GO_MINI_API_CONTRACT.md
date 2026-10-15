Snapshot from GO Lovable commit 0fbc3474e059e1622fc26df7cbccea196c712309, 2026-10-16. Backend remains owned by the existing GO project; this document is not a second deployment source.

# go-mini-api 服务端契约（小程序 / 原生共用）

入口：`POST /functions/v1/go-mini-api`，请求头 `Authorization: Bearer <用户JWT>`、`apikey: <anon>`。
请求体：`{ "action": string, "params"?: object }`。
成功：`HTTP 200 { "ok": true, "data": <DTO> }`；失败：`HTTP 4xx/5xx { "ok": false, "code": string, "message": string }`。

## 入口闸门（所有 action，顺序固定）
1. `auth.getUser` 失败 → `401 unauthorized`
2. 账号停用 → `403 account_suspended`
3. `current_user_erp_scope().scope ∉ {hq, store}` → `403 erp_scope_not_ready`（附 `reason`、`require:"erp-scope-sync"`）
4. `erp_scope_fresh_v1()` 为 false（租约 > 60s）→ `403 erp_scope_not_ready`
5. 之后才判断 action；未知 → `400 unknown_action`（无数据）

所有业务读写用调用者 JWT（RLS）。service_role 只用于 `go_quiz_attempt_create/submit`。

## 通用类型
```ts
type Paged<T> = { items: T[]; page: number; page_size: number; has_more: boolean }; // page 从 0；page_size 1..50，默认 20
```

## 选店参数 `shop_id`（learning / objectives / marketing-assets / marketing-detail）
- 可选 uuid（格式错 → `400 invalid_params`）。必须在服务器当次 `current_user_erp_scope().shop_ids` 内，否则 `403 shop_forbidden`；不接受客户端 meta。
- `shop_ids` 语义（线上定义核验）：
  - HQ（ERP 角色含 super_admin/hq/headquarter/hq_operator）：`shop_ids` = 全部 `shops.active=true` 门店，即完整白名单，不是空数组；与 `current_shop_context_v1().authorized_shops` 同源（`erp_authorized_shop_ids()`）。
  - store：ERP 映射门店（全部须为 active，否则整体 unconfigured）。
  - 停用 / 映射撤销 / 未同步 → scope=unconfigured，在入口闸门即 403，不会到达选店。租约过期由 `erp_scope_fresh_v1()` 拒绝。
  - 当日休息（`current_shop_context_v1().status="rest"`）不改变 scope，不拒绝读取，与网页一致。
- 未传：不加门店过滤（仍受 RLS）；响应 `shop_id: null`。
- learning / objectives：`shop_id = 选店 OR shop_id IS NULL`（合并全局条目）。
- marketing-assets：`shop_id = 选店`（精确）。
- marketing-detail：素材 `shop_id` 与选店不一致 → `404 not_found`。

---

## tasks `{}`
与网页 `useTasks` 同口径；上海日 `[YYYY-MM-DDT00:00:00+08:00, T23:59:59.999+08:00]`。
```ts
{
  date: "YYYY-MM-DD",
  pending_exp: { id: uuid; source: string; amount: number; title: string; created_at: string }[],
  claimed_today: { task_key: string; amount: number; claimed_at: string }[],
  today_counts: { scans: number; quiz_passed: number; quiz_attempts: number /* = quiz_passed，兼容旧字段 */; community_posts: number },
  items: {
    id: TaskKey; task_key: TaskKey; title: string;
    progress: number; target: number; completed: boolean; claimed: boolean; amount: number;
  }[],
  pending_items: { id: uuid; pending_id: uuid; title: string; amount: number; source: string; created_at: string; claimed: false; completed: true }[]
}
type TaskKey = "daily_first_scan" | "daily_3_scans" | "daily_quiz" | "daily_post";
```
| task_key | title | target | amount | 计数来源 |
|---|---|---|---|---|
| daily_first_scan | 完成 1 次识别 | 1 | 5 | products.created_by=本人，created_at 当日 |
| daily_3_scans | 完成 3 次识别 | 3 | 10 | 同上 |
| daily_quiz | 通过一次知识测试 | 1 | 15 | knowledge_test_results.passed_at 非空且当日 |
| daily_post | 发一条BOOMER 圈帖子 | 1 | 5 | community_posts.user_id=本人，created_at 当日 |

## task-claim `{ task_key: TaskKey } | { pending_id: uuid }`
- `task_key` 调 `claim_daily_task`；`pending_id` 调 `claim_pending_exp`。达标/重复由 RPC 判定。
- 成功：`200` 原样返回 RPC 结果（`{ ok: true, amount: number, ... }`）。
- RPC `ok:false` → `409 claim_rejected`，message 含 reason（如 `already_claimed`、`not_found_or_claimed`）。不会 200 假成功。
- task_key 不在上表 → `400 invalid_params`。

## favorite-remove `{ id: uuid /* user_favorites.id */ }`
只删本人收藏；幂等（不存在也成功）；删后读回确认。
`{ id: uuid; removed: true }`；读回仍存在 → `500 db_error`。

## knowledge-favorite `{ id: uuid /* official_knowledge.id */, favorite?: boolean }`
只支持官方知识。传 product_knowledge.id → `404 not_found`。
- 收藏：`{ favorite: true; favorite_id: uuid }`（已存在返回原 id）
- `favorite:false`：`{ favorite: false }`

## knowledge-detail `{ id: uuid, kind?: string /* 或 source */ }`
```ts
{
  kind: "official" | "knowledge" | "sop" | "qa" | "favorite" | "recognition";
  id: uuid; title: string; body: string | null; cover_url: string | null;
  quiz_kind: "official" | "knowledge" | "favorite" | null;
  quiz_available: boolean; // = quiz_kind != null
  raw: object; // 递归去除 quiz/pool/questions/correctIndex/correct_index/correct_answer(s)/answer(s)/answer_index/explanation
}
```
raw 内新增字段：
- official：`is_favorite: boolean; favorite_id: uuid | null`（本人对应收藏）
- knowledge / sop / qa：`is_favorite: false; favorite_id: null`
- favorite：`{ favorite: {id, source_type, source_id, snapshot, created_at}, source: object | null, source_available: boolean, is_favorite: true, favorite_id: uuid }`
  - 无可读源 → `quiz_kind: null, quiz_available: false`
  - 源可读但出题失败 → 由 `quiz-start` 返回错误（`502 upstream_error` / `403 forbidden`）

## learning `{ type?: "sop"|"qa", category_id?: uuid, shop_id?: uuid, page?, page_size? }`
`{ shop_id: uuid|null } & Paged<{ id, type, category_id, title, body, tags, sort_order, shop_id, updated_at }> & { categories: {id,type,name,sort_order,shop_id}[] }`

## objectives `{ shop_id?: uuid, page?, page_size? }`
`{ shop_id: uuid|null } & Paged<{ id, title, objective, key_results, key_actions, tags, scope, shop_id, period_start, period_end, updated_at }>`

## marketing-assets `{ kind?: string, shop_id?: uuid, page?, page_size? }`
`{ shop_id: uuid|null } & Paged<{ id, kind, output_url, input_image_urls, output_text, meta, tags, category, shop_id, user_id, published_platforms, published_at, created_at }>`

## marketing-detail `{ id: uuid, shop_id?: uuid }`
行授权仍由 RLS + 选店过滤决定；成片地址按以下顺序解析（不使用 service_role、不代签他人文件）：
1. 有 `meta.storage_path`：先用本人 JWT 对 `marketing-videos/<storage_path>` 签 1 小时 → `output_source:"fresh_signed"`。
2. 签名被拒（如同店同事的文件）：仅当该行原 `output_url` 满足以下全部条件才复用：
   - origin 与 SUPABASE_URL 完全一致，https；
   - 路径为 `/storage/v1/object/sign/marketing-videos/<storage_path>`（→ `stored_signed`）或 `/storage/v1/object/public/marketing-videos/<storage_path>`（→ `stored_public`）；
   - 签名 token 的 `url` 声明 = `marketing-videos/<storage_path>`、无 `transform`、`exp` 距今 ≥ 60 秒；
   - 不接受 `/storage/v1/render/...` 缩略图或其他查询参数。
3. 无 `storage_path`：只接受本项目 `/storage/v1/object/public/...` 原件；其余（含供应商临时链接）→ `provider_url_not_persisted`。

```ts
列表行字段 & {
  output_url: string | null;
  output_source: "fresh_signed" | "stored_signed" | "stored_public" | null;
  source_error: "storage_not_accessible" | "storage_missing" | "signed_url_expired" | "source_path_mismatch" | "provider_url_not_persisted" | null;
  signed_expires_in: number | null; // fresh=3600；stored_signed=token 剩余秒数；public=null
  cover_url: string | null;          // 网页同口径 meta.poster_url || meta.cover_url，原样
  cover_error: "signed_url_expired" | null; // 仅当封面是本项目签名 URL 且已过期
}
```

## checkin-status `{ page?, page_size? }`
```ts
{ date: string; timezone: "Asia/Shanghai"; checked_today: boolean;
  today: CheckIn | null;
  stats: { current_streak: number; longest_streak: number; total_check_ins: number };
  history: Paged<CheckIn> }
type CheckIn = { id: uuid; check_in_date: string; checked_at: string; streak: number; exp_gained: number };
```

## checkin-submit `{}`
调用网页同一 `perform_check_in`（服务器上海日期）；并发重复被唯一约束拦截也按已签到处理；读回今日记录。
`{ already: boolean; checked_today: true; record: CheckIn; experience: {total_exp,current_streak,longest_streak,total_check_ins} | null; exp_gained: number; bonus: number }`

## profile-update `{ display_name?: string, avatar_data_url?: string }`
只允许这两个键，其他键 → `400 invalid_params`。昵称 1–30 字；头像 `data:image/(jpeg|png|webp);base64`，≤1MB，存 `avatars/<uid>/me-<ts>.<ext>`。
`{ profile: { display_name, avatar_url, real_name }; real_name_readonly: true }`

## 答题（摘要，详见迁移 0003 / 0007）
- quiz-start `{ kind: "official"|"favorite"|"knowledge", id }` → `{ quiz_token, expires_in_seconds: 1800, pass_threshold: 0.8, questions: {index, stem, options[4]}[] }`
- quiz-submit `{ quiz_token, answers: int[-1..3][] }` → `{ replay, kind, id, score, total, passed, submitted, correct: boolean[], correct_answers: int[], submitted_at, persisted: boolean }`；第一次提交定型。

## 错误码汇总
401 unauthorized · 403 account_suspended / erp_scope_not_ready / shop_forbidden / forbidden / upload_forbidden · 400 unknown_action / invalid_params · 404 not_found / invalid_quiz_token · 409 claim_rejected · 410 quiz_expired · 413 payload_too_large · 429 rate_limited · 500 db_error / internal_error · 501 feature_unavailable · 502 upstream_error · 504 upstream_timeout
