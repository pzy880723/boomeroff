Base snapshot from GO Lovable commit 0fbc3474e059e1622fc26df7cbccea196c712309, plus Round 12 deployed DM/community contract at 7a3081199b99cbee95c0ea72d2ca5ffa785ba9ea (deployment fingerprint 654c25d0), 2026-10-16. Later round sections supersede earlier behavior. Backend remains owned by the existing GO project; this document is not a second deployment source.

# go-mini-api 服务端契约（小程序 / 原生共用）

## Round19-21 Continuous Practice Window

Final ref `a8e36ee6a14b3577b68764b0b7452f6623d15e4d` was confirmed finished by get_project. New read-only `practice-library {}` reuses the caller-JWT authenticated/fresh ERP gate and reads only caller-owned favorites, ordered created_at/id descending. It takes301 and returns the latest300, with `{items,window_limit:300,has_older:boolean,as_of}`. Item projection matches my-library plus strict passed derived only from the caller's favorite results for window IDs, queried in batches of100. Any favorite/result query error fails the whole request; no false unmastered fallback. Client actor parameters do not select an identity. No migration, RLS, grant or service business read was added; existing my-library is unchanged.

This is not a server daily quota, task ledger or transactional snapshot. The native coordinator selects the oldest five pending within this window, then excludes this device/account/store/Shanghai-day's confirmed attempted IDs. Both failed and passed saved attempts count as practiced, not necessarily mastered. The current queue is RAM-only and does not refill automatically; ordinary favorite quizzes count too. Cross-device and half-question restoration are not claimed.

R19 practice snapshot stripping and the old index knowledge stripper returned the original subtree past depth12. Main and independent actual-function synthetic reproductions confirmed deep answer keys survived. R20/R21 now retain primitive values but replace over-depth objects/arrays with null. Main replayed the original14-layer input against final index: no answer survives and shallow summary remains. The first attempted node_repl dynamic-code run was blocked by its host and is not execution evidence; the successful reproductions used Node CLI on the actual function with only TS annotations removed.

Independently recomputed UTF-8 hashes at final ref:

| File | SHA256 |
| --- | --- |
| index.ts | 0c1a76390de6f34a565ca6d59512daaa39f8b4a9abd90a87077c68440b31ea3d |
| practice.ts | 49db094409b4c4ce69160e732bd9683f76bd3f67dd47f3ba06fb3404277ead3c |
| knowledge-strip test | 3ff20214ed6f0788af8e665699274a7cfcd40e5a2a91c915ae80d7ac8e9d32f5 |

Lovable reports read-only synthetic RED/GREEN tests, Deno73 with type checking and Edge deployment. New tests drive actual knowledge-detail handlers for official/knowledge/favorite-official/favorite-recognition/history at12/13/14 depths, mixed-case answer keys and arrays; ordinary list regression is not deep-strip coverage because that list does not call stripAnswers. recognition-save shares the fixed stripper but lacks a new dedicated deep test. Main did not execute these Deno tests or compare deployed bundle bytes. Anonymous practice-library returned401 unauthorized, proving denial/reachability only. No real employee exam or business record was touched.

Independent fixed-source review confirmed R20 and R21 P2 closure without a new confirmed P1/P2: R20 actual-source mock10 plus extra cutoff probes; R21 forty-five synthetic sanitizer/detail-handler combinations and four boundary assertions passed. These are Node-based independent executions, not the reported Deno73 or actual production employee requests.

## Round18 Quiz Persistence Fact

Final source ref `42984c7ae027a2086ecd93fc05bfdcf35122d1fa` was confirmed with get_project (`agentFinished:true`); the response prose's `77fa0e02` was an intermediate snapshot. Main read 0018, quiz.ts and index.ts at the final ref and independently recomputed raw UTF-8 hashes, matching the report:

| File | SHA256 |
| --- | --- |
| 0018 migration | 69ea2c58c0db7eb38a719537104962f44eb213248c2dcda9b28f307e940d6a89 |
| quiz.ts | 610d43d764755e2bc2c3f68174e7b5111494ccd1dd04defacdc464d9e9d32fa8 |
| index.ts | 1e56e64d9cb1380e422e044de9486ee1b0b0dec230e18921d8f86cd8f36ce9ee |

0018 adds nullable internal `result_persisted` to the existing private-attempt workflow; historical rows are not backfilled. The first submission locks the attempt and atomically records whether it wrote the knowledge result. Normal first/replay returns true; a deleted favorite first/replay returns false; pre-migration submitted attempts with unknown fact return null. Replay uses this recorded fact, not the current existence of a result row. An insertion error rolls the whole transaction back. Existing TTL, first-result freeze, ownership and service-only submit authority remain unchanged.

Edge `normalizeQuizSubmit` returns true only for strict database true; missing/null/malformed flags are false. The native page likewise never reports a saved grade without strict true. This supersedes the old default-to-true behavior and earlier generic claims that persistence was fully repaired.

Lovable reports 0018 applied and Edge redeployed, observed local PGlite RED-to-GREEN, quiz SQL5/R15 SQL11/R17 SQL11 synthetic groups executed with forced rollback through its privileged backend tool, Deno59 and existing Web/knowledge/community regressions passing. Main did not execute privileged SQL or compare deployed bundle bytes. Post-deployment public-key-only requests to quiz-submit and publication-upload-status each returned 401 unauthorized; this proves reachability and anonymous denial only. Independent fixed-source review confirmed the P2 closed with no confirmed new P1/P2, running the normalization test and twenty malformed-value combinations in memory. The reviewer did not execute SQL or true concurrent sessions. Real employee/device acceptance remains separate.

## Stage2 Evidence Source Checkpoint

Fixed ref `302281df8b2b00962b5b3759578ca8c37d3fa7f8` is the final Round16 GO Lovable source read by main. Lovable reports `0016_go_evidence_upload_native.sql` applied and `go-mini-api` deployed. Main independently recomputed the UTF-8 hashes below; these match the reported files from ref 4385f6ff, but do not prove equality to the deployed bundle bytes. Independent review confirmed two P2 gaps: consumed historical attestations could sign a changed current object, and associated-image reads/detail omitted original activity/shop binding after rebind. Round17 fixed source is `d6c94826445617aa5d41a8f053e107244d0d159d`, confirmed by get_project. Main read its evidence handler and additive 0017 migration; Lovable reports migration application and Edge redeployment. Independent fixed-source review confirmed both P2s closed with no confirmed new P1/P2; eleven in-memory tests and sixteen malformed-flag signing probes passed. The reviewer did not execute database SQL or real Storage I/O.

| File | SHA256 |
| --- | --- |
| index.ts | e34eda73a07f04de9d4eae7f2dffce57f2eed0938c5058ebb33b3fdf31435095 |
| evidence.ts | b2fb3d80cfa7d95c3209112e7de4c5d7ea1aa3f28c8e3f7a67e7d3126db664f2 |
| activity.ts | a6251904da8bce602b9ae57232fa2926e3396b89470cd07b3c7f50a44481e55e |
| 0016 migration | 5605c563b2770624c907c0a5c6b5a1c2671c56fbf6cbf5fa3ece3c6eba06c981 |

Round17 independently recomputed UTF-8 hashes: evidence.ts `f2b1e6cf374dba5f7f02ca237496333e1aafb0281b37f46149ffa357647e8ddf`; 0017 migration `2308f89e08e1a99da0ae0b118ec33a19f42f9e6fc9b6ec5a9ecdbbe5ecec43b7`. The SQL status now returns strict boolean `object_current`, independent of the historical consumed state. Only verified/consumed plus strict true can be signed; unverified/missing/nonboolean flags cannot sign. Associated Storage reads and detail attestation now require the intent's original activity and shop to match the current application relation. Rebinding retains old paths but cannot turn them into verified cross-store previews.

The native status adapter requires that strict current-object proof too. Explicit false is projected to local `object_changed` with retained path and no eligible receipt; missing/nonboolean proof rejects. This also prevents the existing consumed-associated page branch from accepting a changed object. A RED-to-GREEN regression and independent 52-test helper/page run cover this local projection; real Storage and device acceptance remain unverified.

The 0016 section supersedes Stage1's no-new-upload restriction, not its authority or original-reference preservation. Capability has strict boolean `can_upload_evidence` and `upload_policy` with 10485760 bytes, 9 pending unassociated new intents, 600-second intent lifetime and jpg/png/webp/gif/heic/heif/avif. Existing screenshot totals are not capped at nine.

- All three upload actions bind `shop_id/activity_id/application_id/request_id`; commit also requires `intent_id`, status optionally checks it. Caller identity, current fresh same-store manage authority and application relation are rechecked.
- `publication-upload-intent` additionally takes `format/byte_size/digest_sha1` and returns the flat intent metadata, `created_at/expires_at/replay`. Server-issued path is exactly `publish/<application>/go-native-evidence-<intent>.<format>`. Replays do not extend expiry. No upload URL/token is returned.
- Upload uses caller-JWT `wx.uploadFile` to the existing GO origin's Storage endpoint, with `x-upsert:false` and unchanged original bytes. Transfer success is not verification.
- Raw commit returns `{...binding,intent_id,state:'verified'|'consumed',receipt:<attestation>}`. The attestation has no nested state or preview; it binds actor, request/resource identities, file fingerprint, object id/version, full SHA256, `verified_at`, expiry and replay. Commit does not issue a preview signature.
- Raw status returns `{...binding,state,intent?,receipt?,preview?}`. Optional fields may be absent. Preview is separate from receipt. Expired/object_changed states may retain a historical attestation; this does not make that image eligible for a new publication. Status priority is consumed, expired, verified/object_changed, uploaded_unverified, pending.
- The shared native adapter validates the outer envelope and attestation, flattens only verified/consumed receipts into the already frozen page contract, supplies nullable fields, and independently validates an exact same-path/project preview. Missing signing does not drop the path. Noneligible historical receipts are not exposed as eligible page receipts.
- `publication-confirm` adds optional `new_evidence_intents` (default empty). Exact original paths remain preservable/removable. New paths require included own verified/unconsumed/unexpired/current-version intents; unused IDs reject. Consumption, CAS and receipt are atomic. No new IDs preserves v2 receipt hashing; new IDs use v3. The old nine-argument RPC was dropped.
- New source-verified first-send transaction-abort pairs are 422 evidence_invalid/evidence_not_included, 409 evidence_not_verified/evidence_consumed/object_changed, and 410 intent_expired. These never release a request that was already unknown/restored. No automatic mutating retry is authorized.

Trusted attestation is service-only and rechecks the explicit actor's current equivalent gate; service credentials do not read Storage, sign images or read arbitrary business tables. Four restrictive policies narrow only new marker paths, AND existing permissive policies; legacy paths remain unchanged. Platform owner/service bypass remains a trust boundary, not absolute immutability. Actual Storage-service insertion/signing, real concurrency, employee/device acceptance and legacy Web fresh-session compatibility have not been verified.

## Round15 Activity Stage1 Source Checkpoint

### Follow-up 0015 (Current Interface)

Fixed ref `171330bf87cfa05885edb89d28ce2cc6a8b3b5ec` adds `0015_go_activity_publish_bind_activity_and_projection.sql` without rewriting applied 0014. Both `publication-confirm` and `publication-confirm-status` now require **activity_id** alongside shop/application/request IDs. Confirm locks and validates the current relation, hashes canonical `publication-confirm/v2` including activity, and requires request/current/receipt activity agreement before replay. Status applies the same binding. Relation mismatch is 404 not_found, not success. Old RPC signatures without activity were dropped; only the new narrow signatures receive authenticated EXECUTE.

SQL and Edge both whitelist six actual field types, the two actual optional roles, nonempty non-reserved keys and scalar values. Returned schema is projected; internal reserved keys and unknown-type/object/array values cannot pass through a declaration or JSON stringify fallback. Existing phone masking and original-path preservation remain.

Lovable reports 0015 applied and Edge deployed, eight Deno tests, eleven synthetic SQL rollback groups and existing regressions passing, with no residual synthetic rows. SQL changes were not red-tested against the old deployed schema before migration; Deno red/green was observed by Lovable. Main and independent fixed-source review confirmed both P2s closed, with no additional confirmed P1/P2. The reviewer reran the original projection reproduction against the actual Edge function in memory, not the database. Actual employee and online bundle-byte acceptance are not implied.

Main independently recomputed raw UTF-8 SHA256 from that ref: activity.ts `0eb941f66da44315c1bdab83605c184c1acb2bee43d18588ed12a59935b301f6`; index.ts `fded66bb4f94b2648d1325a8c30d97335b851562fccca97b17dc8aee777d071b`; 0015 migration `79a80d6663596ed0e4c1da680a5f8f858468067fb757c37ae64c9f1a02e29d06`. All match reported workspace-file hashes. Opaque deployment source_sha256 is not a reproducible source fingerprint and was not used for equality claims.

For the first send of a never-unknown UUID only, exact trusted confirm responses `(400,invalid_params)`, `(404,not_found)`, `(409,version_conflict)` and `(422,screenshot_not_allowed|note_too_long|invalid_url)` prove that call did not commit. Optional `(400,shop_required)` is pre-RPC rejection, not a database abort. These pairs were checked against 0015 and activity.ts error mapping. They never release a historical/restored unknown intent. 401/403, request_id_conflict, db_error, transport/unknown errors and read-only status not_found remain excluded. Relation not_found cannot be used to infer that no historical receipt exists.

The following 0014 section is retained as audit history; the required activity binding and safe projection above supersede its earlier request shape and open findings.

Fixed source: `2c1566fecb7a78c02924cb3f349a2340d84f9a5d`. Main read `activity.ts`, the index handler and `0014_go_activity_publish_confirm_native.sql`. Lovable reports the migration applied and Edge deployment successful. Independent review is still in progress; this checkpoint is not real employee acceptance or online-bundle byte verification.

- `activity-capabilities {shop_id}` returns exact shop and strict `can_manage`, `can_confirm_publish`, `can_upload_evidence:false`. Existing `voucher.manage` is required for application data and confirmation; ordinary/redeem-only staff do not gain access.
- `activity-applications {shop_id,activity_id?,publish_confirmed?,limit?,cursor?}` returns shop/activity/filter echoes, masked items, opaque `next_cursor`, `has_more` and `order:'desc'`. Pagination retains database microseconds, ordered by created_at/id descending. Limit 1-50, default 20.
- `application-detail {shop_id,application_id}` returns masked application, declared form answers, activity schema, six publish fields, a 64-hex version and server time. Phone-type answers are masked in SQL. Raw form_data is not returned. Original evidence paths remain even if signing fails; only same-row `publish/<application>/filename` and `activity/<activity>/filename` can receive caller-JWT 600-second signatures.
- `publication-confirm {shop_id,application_id,request_id,expected_version,target_confirmed,note,url,screenshots}` uses explicit boolean target, normalized note <=200 code points, URL <=500 code points, and only exact current original screenshot members. Keep/reorder/remove references is supported; no new uploads and no Storage deletion. False saves note/URL/references and clears actor/time, matching Web semantics; approval, claim, SMS and social publishing are untouched.
- The write uses current identity/fresh scope/exact shop/manage checks, row lock, private idempotency receipt lookup before six-field CAS, UPDATE RETURNING and atomic metadata-only receipt. Status lookup is read-only; not_found does not prove an uncertain write failed. Native code must retain the original key and never auto-resend.
- Errors: 401 unauthorized; 403 account_suspended/erp_scope_not_ready/shop_forbidden/forbidden; 400 shop_required/invalid_params/invalid_cursor; 404 not_found; 409 version_conflict/request_id_conflict; 422 note_too_long/invalid_url/screenshot_not_allowed; 500 db_error with fixed messages.
- Source hashes independently recomputed from the fixed ref's raw UTF-8: index.ts `fded66bb4f94b2648d1325a8c30d97335b851562fccca97b17dc8aee777d071b`; activity.ts `b739493daf473cfadd90fbdc77c959342214d57b679255aca9570cd6a962f621`; migration `2f405d3124e688991d45b46b37d01190587126c2665955eed017c4578ae26557`. These match the reported workspace-file hashes, not an opaque deployment fingerprint.
- Lovable reports seven focused Deno tests and nine synthetic SQL rollback groups passing, plus existing voucher/schedule/DM/media/shop/community/Web/quiz regressions. Main has not rerun privileged SQL or two-session concurrency. No real applications, customer evidence or employee data were accessed.
- Open review items: revalidate current activity relation on receipt replay/status; exclude reserved/unsupported form fields independently of schema declaration. Do not regard this source checkpoint as final security sign-off.
- Stage2 new evidence upload remains required. Existing global Web manage RLS, direct client confirmation and broad screenshot-bucket policies were not globally repaired by these narrow native endpoints.

入口：`POST /functions/v1/go-mini-api`，请求头 `Authorization: Bearer <用户JWT>`、`apikey: <anon>`。
请求体：`{ "action": string, "params"?: object }`。
成功：`HTTP 200 { "ok": true, "data": <DTO> }`；失败：`HTTP 4xx/5xx { "ok": false, "code": string, "message": string }`。

## 入口闸门（所有 action，顺序固定）
1. `auth.getUser` 失败 → `401 unauthorized`
2. 账号停用 → `403 account_suspended`
3. `current_user_erp_scope().scope ∉ {hq, store}` → `403 erp_scope_not_ready`（附 `reason`、`require:"erp-scope-sync"`）
4. `erp_scope_fresh_v1()` 为 false（租约 > 60s）→ `403 erp_scope_not_ready`
5. 之后才判断 action；未知 → `400 unknown_action`（无数据）

所有一般业务读写用调用者 JWT（RLS）。service_role 用于 `go_quiz_attempt_create/submit`，Stage2 另仅调用 `go_evidence_attest_v1` 写入可信 Edge 的字节核验事实；不便利读取 Storage 或业务表。

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

## 员工私信 dm-*（Round 9，迁移 0008_go_dm_native_v1.sql）

通用：同一入口（getUser + 新鲜 ERP scope），全部用本人 JWT RLS；不读手机号；无在线状态字段（不伪造）。
现有 RLS：direct_messages SELECT 仅 sender/receiver=本人；INSERT 仅 sender=本人；UPDATE 仅 receiver=本人。
通讯录来源 = staff_profiles 现有 RLS（本人 / 授权门店且 HQ 或 staff.read），再按 scope.shop_ids 收窄。
注意：store 员工若无 staff.read，现有 RLS 下通讯录为空（不提权）；当前 3 个有效 ERP 绑定均不受影响。

Person DTO: `{user_id, name, avatar_url, position, shop_id, shop_name, is_contact}`
（name = 范围内 real_name，否则 RLS 可读的 profiles.display_name，否则 null；avatar_url 仅 profiles 可读时有值）

Message DTO: `{id, sender_id, receiver_id, mine, body, attachment: null | {kind:"image"|"video"|"file", url, name, size, mime, error: null|"attachment_expired"|"attachment_source_invalid"}, created_at, read_at, cursor}`
- url 仅返回本项目 `/storage/v1/object/sign/chat-attachments/<sender_id>/...` 且 token.url 一致、无 transform、剩余≥60s 的签名 URL；其余 null + error。不代理远程 URL。旧行无 attachment_type 但有 image_url 视为 image。

### dm-contacts
params `{page?:int≥0, page_size?:1..50 (默认50), shop_id?:uuid}` → `{items:Person[], page, page_size, has_more}`；shop_id 不在 scope → 403 shop_forbidden。

### dm-conversations
params `{page?, page_size?:1..50(默认20)}` → `{items:[{peer:Person, last_message:{id,sender_id,mine,preview,created_at}, unread_count}], page, page_size, has_more, total_conversations, unread_total}`
- 由 SECURITY INVOKER 函数 `dm_conversations_v1` 在全部本人消息上聚合（非截取 200 条）；unread_count 为该 peer 发给我且 read_at null 的完整计数。preview 同 Web：正文前60字/[视频]/[文件]/[图片]。

### dm-messages
params `{peer_id:uuid, page_size?:1..50(默认30), before?:cursor, after?:cursor}`（before/after 互斥）
→ `{peer_id, order:"desc"|"asc", items:Message[], page_size, has_more, next_before, next_after}`
- 默认/before：最新→更早，严格 `(created_at,id) < cursor`；after：增量，升序，严格 `> cursor`。游标为 base64url([created_at 原文(微秒), id])。
- 首屏：不带游标，向上翻页传 next_before，轮询新消息传 next_after。

### dm-send
params `{peer_id:uuid, request_id:/^[A-Za-z0-9_-]{8,64}$/, body?:string(trim,≤2000), attachment?:{kind, storage_path:"<本人uid>/...", size:1..41943040, mime?, name?}}`（body 与 attachment 至少一个）
→ `{message:Message, replay:boolean}`
- sender 只取服务端已验证用户；幂等：唯一索引 (sender_id, client_request_id)，并存 client_request_hash=sha256(规范化收件人、正文及附件 kind/storage_path/size/mime/name)。同 request_id 的任何字段不同或旧行缺少 hash 均返回 409 request_id_conflict。每次 replay 也先重验 peer 发送资格。
- 对象：范围内通讯录同事，或已给我发过私信的人（只回复既有会话）；否则 403 peer_forbidden；不能给自己发。
- 附件：小程序先用本人 JWT 上传至私有桶 `chat-attachments/<uid>/<文件>`（与 Web 相同，Storage 策略仅本人目录读写），服务端用本人 JWT 签 5 年 URL 写入 attachment_url（图片同时写 image_url），与 Web 存储格式一致；对象不存在/非本人目录 → 403 attachment_forbidden。

### dm-read
params `{peer_id:uuid, message_ids:uuid[1..100]}` → `{updated_ids, read:[{id,read_at}], ignored_ids}`
- 只更新 receiver=本人、sender=peer_id、id∈message_ids、read_at null 的行，仅改 read_at；不属于的 id 进 ignored_ids。

错误码：400 invalid_params，403 shop_forbidden/peer_forbidden/attachment_forbidden，409 request_id_conflict，500 db_error。

验证（事务内合成账号，结束回滚）：本人会话 3 条可见；他人 b↔c 消息 0；冒用 sender 被 RLS 拒绝；重复 request_id 23505；改非本人收到消息 0 行、本人 1 行；同微秒时间按 id 分页 desc=m3,m2,m1、before(m2)=m1、after(m1)=m2,m3；会话未读 2；anon 不可调用。

## 通知（Round 10 补充）

### notifications（稳定排序）
params `{page?:int≥0, page_size?:1..50(默认20)}` → `{items:[{id,title,summary,body,type,category,image_url,created_at,expires_at,read}], page, page_size, has_more}`
- 过滤：RLS（active 且未过期）+ active=true；非 admin 排除 type=backup。排序 created_at DESC, id DESC（同时间戳稳定）。offset 分页 range(page*size, page*size+size)，多取 1 条判 has_more。

### notification-read
- 新精确批量：`{ids:uuid[1..100]}` → `{marked:int, read_ids:uuid[], ignored_ids:uuid[]}`。先用与列表相同过滤筛选 ids，只对通过者 upsert 本人 notification_reads（唯一 notification_id,user_id），再读回本人已读记录；不可见/过期/backup(非admin)/不存在 → ignored_ids。
- 兼容旧：`{id}` → `{marked:1}`；`{all:true}` → 仅最新 50 条 active，`{marked:n}`（原生不再依赖）。ids 优先于 id/all。

## 社区互动 community-*（Round 10，迁移 0009）

可见性：RLS 可读 且 is_public=true 且 is_guest=false（员工 Web 社区同口径）。每个 action（含 replay）先重验，否则 404 post_not_found（隐藏/删除/访客帖不能读评论、点赞或评论）。
计数：likes_count/comments_count 为对 community_likes/community_comments 的实时 count(exact)，不读帖子冗余计数列（合成测试显示非帖主互动时冗余列未更新，属既有问题，本轮未改）。
Author DTO：`{user_id, name, avatar_url}`（profiles.display_name 或 staff_profiles.real_name，仅现有 RLS 可读时；无手机号）。

### community-detail
`{id}` → `{post:{id,name,category,era,origin,image_url,thumbnail_url,story,selling_points,tips,appreciation,description,care_tips,material,craft,dimensions,condition,rarity,collection_value,market_value,buy_reason,created_at,author,mine}, liked, likes_count, comments_count}`

### community-comments
`{post_id, cursor?, page_size?:1..50(默认20)}` → `{post_id, order:"asc", items:[{id,post_id,author,mine,content,created_at,cursor}], page_size, has_more, next_cursor}`
- 旧→新，严格 `(created_at,id) > cursor`；游标同 DM（base64url[created_at 原文微秒, id]）。

### community-like
`{post_id, liked:boolean}`（明确目标，非 toggle）→ `{post_id, liked, likes_count, comments_count}`。true 用唯一 (post_id,user_id) ON CONFLICT DO NOTHING；false 删本人行。回读状态不符 → 409 like_state_mismatch。

### community-comment
`{post_id, request_id:/^[A-Za-z0-9_-]{8,64}$/, content:trim 1..1000 UTF-16}` → `{comment, replay, liked, likes_count, comments_count}`
- user_id 只取服务端；唯一 (user_id, client_request_id)。同 key 同 post+content → 原评论 replay:true；不同 → 409 request_id_conflict；并发 23505 后回读。不同账号同 key 互不影响。

### community-post（不变）
`{product_id}` → `{post_id, created}`。

验证（合成账号、事务回滚）：公开帖可见 1；隐藏帖 RLS 0；访客帖闸门 0；同微秒评论 after(c1)=c2,c3；重复点赞计 1；冒用他人 user_id 点赞/评论被 RLS 拒绝；同用户同 key 评论 23505；跨用户同 key 评论/私信可各自插入，且 B 读不到 A 的私信 key（0 行）；非法 hash 被 CHECK 拒绝。

## 私信 Round 11（迁移 0010_go_dm_snapshot_status_attachment_path.sql）

### dm-conversations（快照分页，兼容旧参数）
params `{page?, page_size?:1..50, snapshot_at?:string}` → 原字段 + `snapshot_at`
- 首屏不传 snapshot_at：数据库 now() 定快照并回传（原文微秒字符串，客户端原样回传，不经 Date）；后页传同一 snapshot_at。
- 由 `dm_conversations_v2(_snapshot,_limit,_offset)`（SECURITY INVOKER）计算：最后一条、unread_count、total_conversations 只含 created_at <= snapshot 的消息；排序 last_created_at DESC, last_id DESC。快照后的新消息不会让会话在页间移动，刷新首屏换新快照即可看到。
- 无任何会话时 snapshot_at 为传入值或 null。
- 合成复现：v1 page2 漏会话（A,B → 新消息后 page2=B）；v2 page2=C、total=3；同微秒按 id 稳定拆页。

### dm-status
`{peer_id, message_ids:uuid[1..100]}` → `{peer_id, statuses:[{id, read_at}], ignored_ids}`
- 只返回本人与该 peer 之间的指定消息的 read_at；不读正文、不改已读；不属于的 id 进 ignored_ids。

### 附件：新消息改为绑定路径 + 1 小时签名
- 新列 attachment_storage_path：CHECK 必须以 sender_id/ 开头，长度 38–300，禁止 `..`、`//`、`\ ? #`、首尾 `/`。
- 消息不可变：authenticated 撤销表级 UPDATE，只 GRANT UPDATE(read_at)（Web 只更新 read_at，已读回执照常）；anon 也撤销 UPDATE。
- Storage 新增 SELECT 策略 chat_attachments_receiver_bound_read：bucket=chat-attachments 且 erp_scope_fresh_v1() 且存在一条本人为 receiver、attachment_storage_path=对象名、对象首目录=sender_id 的消息。发送者本人目录读写策略不变；无公开读、无联系人扩读。
- dm-send 附件：本人 JWT 先签名证明对象存在于本人目录，再写 attachment_storage_path；attachment_url/image_url 写 NULL（不再写 5 年 URL）。
  兼容影响：旧网页只读 attachment_url，所以原生新发的附件在旧网页上不会显示（只显示正文），旧网页本身未改。
- 附件 DTO 新增 `source:"bound"|"legacy"`、`expires_in`（bound=3600，legacy=null）；bound 签不了 → url null，error "attachment_not_accessible"。
- dm-messages/dm-send(replay) 用调用者 JWT 批量签 1 小时；service_role 不参与。
- 新 `dm-attachment {id}` → `{message_id, attachment}`：仅本人参与的消息，用本人 JWT 重新签绑定路径（刷新）；不接受客户端路径/URL。非参与或无附件 → 404。
- 历史行（path NULL）：只复用经校验的本项目旧签名 URL（source:"legacy"）；这些旧 5 年链接仍有效、未撤销，不从 URL 反推路径。

合成回滚验证：绑定他人目录/路径穿越被 CHECK 拒；接收者 fresh 时只能读该绑定文件（1），同目录其他文件 0；第三人 0；接收者 scope 过期 0；接收者改 body/path/sender 均被拒绝；read_at 回执 1 行；发送者读本人目录文件 2；dm-status 语义：参与者 1、非参与者 0。（fresh 判定在事务内临时替换为 true/false，已回滚并核对原函数恢复。）

## 私信 Round 12：固定 ID 快照（取代新原生的 v2 时间快照）

迁移精确路径：`drizzle/migrations/0011_go_dm_conversation_snapshot_ids.sql`、`drizzle/migrations/0012_go_dm_snapshot_tighten_grants.sql`。Lovable 报告均已应用；主流程固定 ref 读取两份 SQL。以下为远端契约摘录，SQL 合成测试是 Lovable 回报，不是主流程真实员工 E2E。

### dm-conversations snapshot_id 冻结分页（Round12，迁移 0011/0012）
params `{page?, page_size?:1..50, snapshot_id?:uuid}`；新原生首屏不传 snapshot_id，后页原样回传。旧 `{snapshot_at}`（且不带 snapshot_id）仍走 v2，v1/v2 均保留未删。
→ 原字段 `{items, page, page_size, has_more, total_conversations, unread_total}` + `snapshot_id, snapshot_at(数据库原文微秒串), snapshot_expires_at, total_at_snapshot, skipped_slots`
- 原因：v2 只按 created_at<=snapshot 过滤，created_at=事务开始时间，首屏前开始、首屏后提交的事务仍会进入后页并改变 OFFSET，可能漏会话。
- 表 `dm_conversation_snapshots`：仅 owner_id/snapshot_at/expires_at/message_ids(uuid[] ≤20000，无 NULL)；不存正文/头像/参与人。owner → profiles(user_id) ON DELETE CASCADE（profiles 随账号级联删除）。RLS 本人 SELECT/INSERT/DELETE，无 UPDATE（无法延长 TTL）；BEFORE INSERT 触发器强制 owner=auth.uid()、snapshot_at=now()、expires_at=now()+5min。anon 无权限，无 service_role 使用，无跨人可见策略。
- `dm_conversations_v3(_snapshot_id,_limit,_offset)` SECURITY INVOKER：首屏先删本人过期快照，再用**单条** INSERT…SELECT 把该语句可见的每会话最新消息 id 按 (created_at DESC, id DESC) 冻结成数组；后页按数组 ordinal 切片 `(offset, offset+limit]`，再以调用者 JWT/RLS 回读 direct_messages（并显式要求本人为 sender/receiver），不再 DISTINCT/OFFSET 动态集合。
- 回读不到的槽位（已删除、或伪造数组里非本人消息）直接跳过，计入 skipped_slots，不影响相邻页；has_more = offset+limit < total_at_snapshot。预览/对端/时间全部来自当前可见的原消息，快照本身不提供任何内容。unread_count = 该 peer 发给我、未读、且 (created_at,id) ≤ 冻结那条最后消息。
- 空集也返回有效 snapshot_id（total_at_snapshot=0）。新消息需刷新首屏（新 snapshot）才出现。
- 错误：非 uuid / 不存在 / 他人 / 过期 → 统一 409 `snapshot_expired`（不区分原因、不泄露他人信息），客户端重新拉首屏。
- 合成验证（真实 SQL，单事务合成账号，最后强制回滚）：6 会话 page_size=2 三页无重无漏；首屏后插入 created_at 早于 snapshot_at 的新会话 H 与 B 的更新消息（等价晚提交）→ 后页顺序不变、H 不出现、B 槽位仍为冻结消息；同微秒按 id desc；删除 C 的消息 → 第三页仅跳过该槽（skipped_slots=1，ord 不变），第二页不漂移；A 伪造含 b↔c 消息 id 的快照 → 不回读、不含正文；owner 伪造为 B → 被强制为 A；新首屏可见 H 与 B 新消息；随机 id/他人 id/过期均 snapshot_expired；B 看不到也删不掉 A 的快照；A 清理不动 B 的过期快照；客户端 UPDATE 被拒；空集有效；anon 不可执行；删除账号级联清除快照。脚本：tests/sql/go-dm-snapshot-v3.sql。

## 原生券 Round 13

固定源码 `a4b3eb9f99aa13d0672a20df5e9be0718ddcea47`；Lovable 报告迁移 `drizzle/migrations/0013_go_voucher_redeem_native.sql` 已应用，`go-mini-api` 已部署。主流程已按固定 ref 读取迁移、BFF、voucher.ts 和契约；独立权限复核与真实员工验收分开记录。

独立源码复核未发现可确认的新增 P1/P2。该 ref 的单文件 index.ts UTF-8 SHA256 为 `330cfa9c73c7731c4bef80aaa1b178a1fa2e8b311c4fb3dfda319ea96b9ef546`，主流程已用 Node crypto 对固定 ref 返回的原文独立复算一致。Lovable 后续撤回之前无法复算的 `bc78c1...` 和 Round14 `27129b...` 两条所谓部署指纹，二者不是有效证据。源码哈希不等于可读取的线上 bundle 哈希；没有线上源码下载比对，不能宣称部署包已逐字节对齐。主流程本轮匿名请求新 action 收到 `401 unauthorized`，仅证明匿名被拒。

- 四个 action 均要求当前已验证 `shop_id`。RPC 自身再检查 auth.uid、未停用、fresh ERP scope、非空且已授权门店，以及既有 voucher 权限；不新增整表 GRANT/RLS，不使用管理员 Edge 客户端读取券。
- `voucher-capabilities {shop_id}` → `{shop_id,can_lookup,can_redeem,can_manage}`。查券使用现有 redeem OR manage；manage-only 不获得核销权限。
- `voucher-lookup {shop_id,code}`：code 为 trim 后转大写的八位 ASCII 字母数字。返回 `{shop_id,claim:{id,code,status,claimed_at,expires_at,redeemed_at,recipient_name_masked,recipient_phone_tail,voucher:{id,name,threshold_type,discount_amount,min_spend,template_terms,starts_at,ends_at,active}},can_redeem,reason,server_time}`。不返回原姓名/手机号。其他店、NULL 店、不存在统一 `404 not_found`。
- 核销条件是已领取且未核销/作废/过期、模板启用且未软删且在有效期内；期限等于服务器 now 也不可用。模板结束返回 `voucher_unavailable`；claim 到期返回 `expired`。manage-only 的 reason 是 `no_redeem_permission`，不由客户端猜测可核销性。
- `voucher-redeem {shop_id,code,request_id:uuid}` → `{request_id,shop_id,claim_id,code,status:'redeemed',redeemed_at,redeemed_by_me:true,replay:boolean}`。条件 UPDATE 的实际 RETURNING 行与私有幂等回执同一事务提交；回执仅存核对字段，不含领取人 PII。相同 key/本人/店/码回原回执，不同 payload 或 actor 使用已存在 key → `409 request_id_conflict`；重放仍重验当前权限。
- `voucher-redeem-status {shop_id,code,request_id}` 只读且仅本人：`{state:'not_found'}` 或 `{state:'succeeded',...原回执}`。not_found 不证明原请求失败，其他请求已核销也不证明本次成功。客户端不得据此自动换 key 或重发。
- 合法错误包含 `400 invalid_params/shop_required`、`403 forbidden/shop_forbidden/account_suspended/erp_scope_not_ready`、`404 not_found`、`409 already_redeemed/void/not_claimed/voucher_unavailable/request_id_conflict`、`410 expired`；未知数据库错误统一 `500 db_error`，不外泄数据库原文。
- 既有原生 `activities/activity-detail/vouchers/voucher-detail` 现在强制精确选店，活动通过 voucher_id 归属；列表 created_at DESC,id DESC。优惠券列表仍受原 RLS 限制，是门店模板，不是客户个人券包；无原模板读权限可得到空列表，不能借核销权限扩读。
- Lovable 回报新券 Deno 6/6、DM 12/12、media 9/9、shop 5/5、community scope 1/1、Web 15/15、quiz 4/4 及类型检查通过；`tests/sql/go-voucher-redeem.sql` 12 组单事务合成数据验证后强制回滚。主流程未代替其重跑 SQL；没有真实双会话并发测试，没有真实券核销/SMS。
- 旧 Web/旧 voucher-redeem/activity-review、全店 PII RPC、旧 manage RLS 和截图桶绑定风险仍存在，未在本轮声称全局修复；腾讯 Web 未因此自动发布。

## 原生排班 Round 14

固定源码 `5a4cdf6da4bd3d61279bc78d40141b8c8bd52aeb`。Lovable 回报 Edge 已部署、无迁移／GRANT／RLS 变更；先前 `27129b...` 指纹已明确撤回。主流程已读取 schedule.ts、index.ts handler、原 RPC migration 与新契约，独立源码复核未见确认新增 P1/P2。对固定 ref 原文用 Node crypto 独立复算：index.ts SHA256 `20fe3e81491116f9a90ad788c02f5b3375edcacde213aac2df8ea9aa8cf14305`，schedule.ts SHA256 `b1a00f3a0a4bf6989b6d0bd13b035ad3c69ca8f792db1603dd73aec97f267e55`。这些证明固定源码原文身份，不证明可下载的线上函数字节。

- `schedule {month?:'YYYY-MM',shop_id:uuid,view?:'mine'|'shop'}`。缺省 month 为上海当月，非法 month/view 为 400 invalid_params；选店必填且当前 fresh scope 内，缺省 400 shop_required，越店 403 shop_forbidden。固定整月日期闭区间 28/29/30/31 天，不超过既有 RPC 上限。
- 返回 `{month,shop_id,view,can_view_shop:boolean,rows:[{work_date,shop_id,shop_name,user_id,display_name,shift_code,shift_name,start_time,end_time,source,is_rest,is_self}],conflicts:[{work_date,user_id,count}],schedules,shift_defs}`。
- 数据源为既有 `list_shift_schedules_v1`。mine 传 `_shop_id:null`，后续按已验证 uid 仅投影本人 rows/conflicts，可含本人真实调店安排。shop 传精确选店，RPC 的 work/rest 在 merged_json 前已按该店收窄；服务端 can_view_shop 严格 true 才放行，否则 403 forbidden。客户端不传权限，不把同事读取当排班写权限。
- RPC 既有权限：HQ，或 schedule.view_shop，或 staff.read；无新角色和权限。真实 shop_name/display_name 不由本地会话覆盖。is_rest:true 表示明确休息，班次和时间 null；没有行不等于休息、缺勤或请假。
- 原 shift_schedules 有 UNIQUE(work_date,user_id)，RPC 展示按同人同日去重且上班优先；冲突独立返回，不能从展示行数推断没有冲突。整月无 RPC 行数截断。兼容 schedules/shift_defs 仅本人，当月查询上限为 1000。
- RPC 42501 shop not authorized → 403 shop_forbidden；42501 ERP mapping → 403 erp_scope_not_ready；22023 → 400 invalid_params；28000 → 401 unauthorized；其他 → 500 db_error。
- Lovable 报告 Deno 排班 8/8、其余券／DM／媒体／店／社区／Web／quiz 回归均通过；`tests/sql/go-schedule-readonly.sql` 5 组合成 SQL 强制回滚后无残留。主流程未重跑 SQL，没有真实员工或真实排班 E2E。
