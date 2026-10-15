Base snapshot from GO Lovable commit 0fbc3474e059e1622fc26df7cbccea196c712309, plus Round 12 deployed DM/community contract at 7a3081199b99cbee95c0ea72d2ca5ffa785ba9ea (deployment fingerprint 654c25d0), 2026-10-16. Later round sections supersede earlier behavior. Backend remains owned by the existing GO project; this document is not a second deployment source.

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
