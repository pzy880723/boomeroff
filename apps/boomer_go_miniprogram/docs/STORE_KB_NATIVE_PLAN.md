# Current-store SOP And QA Native Plan

**Goal:** Migrate existing employee SOP/QA reading and authorized manual maintenance into native list/read/editor flows, with exact current-store authority and verified writes. AI drafting and category administration remain separate tracked parts of the full migration, not falsely counted as finished here.

**Architecture:** Native store-kb list/read page plus store-kb-edit page use narrow caller-JWT BFF actions. Read RPCs remain SECURITY INVOKER/RLS-bound; write/status RPCs use metadata-only private receipts and necessary SECURITY DEFINER with a full existing-authority gate. No service business reads or new table rights.

**Stack:** Existing WXML/WXSS/CommonJS, wx.request and native modal/picker/input/textarea/rich-text. Shared app identity/selected store and original GO tables remain authoritative.

## Evidence And Design

Sources at GO ref `a8e36ee6a14b3577b68764b0b7452f6623d15e4d`: MySop/MyQa employee CRUD/AI controls; actual RLS and gate definitions recorded in OPERATIONS_KB_AUDIT.md. SELECT policies use shared NULL or authorized ERP store/legacy-transition scope, not a shop.kb.read action. Native fresh ERP base gate excludes unconfigured legacy authority; writes still require existing can_write_scoped(current_store,'shop.kb.write') IS TRUE. Categories use separate shop.kb.category, which is not granted or invoked.

Alternatives: embedding the Web is prohibited; adding write controls to the large unrelated generic detail page risks ownership and field confusion; two dedicated native KB pages keep the complete current-store workflow coherent. Choose dedicated pages, preserve old read links, and tighten the old SOP/QA detail branch to current selected store or shared NULL.

User delegated overnight native design and migration. Preserve approved red/white cards, system Chinese text, readable controls and current tabs. No new tab. List has current store, SOP/QA switch, category chips, server search, true pagination, shared/current-store badges and permission-gated New. Read mode shows safe Markdown headings/lists/emphasis/tables and tags, with shared content explicitly read-only. Editor shows fixed store/type, title, existing-category picker (including shared categories), body and comma-separated tags. Do not create categories or change sort order/type/store. Empty body remains allowed as in Web; title is required. Source text is editable, not a flattened screenshot. Prior supplementary Figma calls failed; precise state spec plus native screenshots are the honest fallback.

## Frozen Backend Surface

All actions bind current required non-NULL shop_id and type=sop|qa; normal BFF auth/suspended/fresh ERP gates precede handlers. SQL RPCs independently recheck uid, suspended IS NOT TRUE, fresh IS TRUE and shop in authorized shops. Do not treat NULL booleans as permission.

- `kb-capabilities {shop_id,type}` -> `{shop_id,type,can_write:boolean,limits:{title_chars:200,body_chars:40000,tags:20,tag_chars:40,query_chars:200}}`. Capability is existing action authority, never inferred from a title/role.
- `kb-list {shop_id,type,q?,category_id?,page?,page_size?}` -> `{shop_id,type,query,category_id,items,categories,page,page_size,has_more,as_of}`. Page0, size1..50/default20. Items include id/shop_id/type/category_id/title/body_preview/tags/sort_order/updated_at; only current-store or shared NULL. Search is literal case-insensitive substring across title/body/each tag, using structured SQL parameters, not PostgREST string interpolation. Categories are same type and current/shared scope; null category filter means all. Sort is sort_order then updated_at/id, consistently frozen in server contract. No invented full totals or snapshot guarantee.
- `kb-detail {shop_id,type,id}` -> `{shop_id,type,entry,categories,version,can_edit:boolean,can_delete:boolean,as_of}`. Entry whitelist: id/shop_id/type/category_id/title/body/tags/sort_order/created_by/created_at/updated_at. Shared NULL may be read, never edited/deleted in this workflow. Version is server canonical SHA256 over actual scoped row/write fields; client does not derive timestamps or guess version.
- `kb-write {shop_id,type,request_id,operation:'create'|'update'|'delete',entry_id?,expected_version?,category_id?,title?,body?,tags?}` -> exact metadata receipt `{shop_id,type,request_id,operation,actor_id,entry_id,version,deleted,recorded_at,replay}`. Create has no entry_id/expected_version; server assigns id/actor/time/store/type and sort_order0. Update/delete bind exact nonshared current-store id/type and expected64hex version. Update changes only category/title/body/tags, preserving sort_order/creator/scope/type. Delete has a separate explicit native confirmation.
- `kb-write-status {shop_id,type,request_id,operation,entry_id?}` -> `{shop_id,type,request_id,operation,requested_entry_id:null|uuid,state:'succeeded'|'not_found',receipt:null|receipt}`. Fresh existing write authority first, then exact own receipt lookup before requiring any target row to exist. Delete success must remain recoverable after its row is gone. not_found does not prove an uncertain write failed.

Title/body/tags are typed and bounded at Edge and SQL; native inputs do not truncate existing long text. Empty body is valid. Existing category may be null, or same type in current store/shared NULL. Validate/lock it FOR SHARE within the mutation transaction so non-key shop/type changes cannot race. No category writes. Invalid or oversized existing content stays readable; native editing reports explicit limits rather than losing text.

Private receipts store canonical full-payload hash and metadata, not body/tags. Bind actor/request/op/type/shop/target/expected version and normalized content; serialize same-actor/request concurrency. Exact replay precedes CAS, mismatched payload conflicts, actual row mutation and receipt commit atomically. No partial-success200. Fixed search_path, revoke default PUBLIC/anon execute and grant only narrow authenticated RPC execute; do not grant private schema usage or table rights. Read RPCs use caller privileges/RLS and SQL-inline version computation rather than exposing private hash helpers.

## Native State And Ownership

Main owns app routes, shared API selected-store injection for all new actions, explicit read-only preview fixtures and integration docs. Page worker owns new store-kb/store-kb-edit pages, their safe Markdown/model helpers, existing entry routing and focused tests. Backend edits remain Lovable-owned, coordinated directly.

Read/capability loads are separately validated against exact current user/store/type/revision and visible epoch; UI does not treat a capability from another type/store as permission. Hide/unload invalidates late responses and action confirmation callbacks. Draft edits survive failed save and same-page hide/show in private page RAM; identity change clears visible/private draft. No disk caching of draft or pending business text.

Before a write, freeze one request UUID/payload in own user/store/type/resource-keyed App RAM. Unknown outcomes retain original key/payload across page unload/reentry in the same app process. Read-only status reconciliation precedes any explicit same-request retry; never auto-resend, replace the key, or discard historical unknown based on status not_found. Auth/scope denial does not erase unknown requests. Confirmed receipt remains until exact readback; a readback failure only retries reading. This is not a claim of process-restart draft recovery.

Create/update success requires exact receipt then kb-detail version and requested-field equality. Delete success requires exact delete receipt then current-scope/type detail not_found; other errors do not prove absence. Conflicts retain the draft and require explicit load-latest confirmation. Only exact first-send never-unknown abort error pairs proven by final server source may release a failed intent; request_id_conflict, generic500, transport errors and restored unknown remain frozen.

Preview is explicitly synthetic, can show local editing fields, but never sends kb-write/status or reports fake saved/deleted results. Native delete confirmations are tested using synthetic models only; no real business deletion or creation is part of agent verification.

## Tasks

- [x] Coordinate narrow backend/read-policy verification and final fixed-source review at R22 37e0466774995fac4ead86325d223b641a57dbe1. Lovable reports 0019 migration/Edge deployment and SQL60 forced rollback, not main-run SQL or real concurrency.
- [x] Freeze actual final action DTO/error surface before native write integration. Main observed selected-store injection tests RED/GREEN; no trusted client role or arbitrary actor. Updates send all four editable fields.
- [x] Page worker observes failing list/read/editor/state tests, then implements native pages and safe Markdown parsing. Existing SOP/QA entries now route natively.
- [x] Cover first-known abort versus restored unknown, late/revoked scope, conflict draft retention, create/delete status after row absence, readback mismatch/failure, no auto retry and preview no writes. Final focused38 independent review passed.
- [x] Independently review backend and native diff; main full728/static22/official23WXML+24WXSS passed. Actual synthetic GUI inspected list/read/editor controls/shared read-only/QA switch and closed literal-condition rendering defect.
- [ ] Complete actual input/error/modal and genuine authenticated/device acceptance. Current GUI evidence does not prove typing or successful business writes.
- [ ] Isolated Mini-only Git push/remote readback/source archive; retain untouched Flutter/index and explicit AppID/real employee/device gaps.

AI drafting is the next step of the same SOP/QA migration: fresh current-store write gate, caller-JWT knowledge/category reads, no pre-save category or entry writes, existing prompt/output adapted only after authorization repair. Do not call the legacy service-role search path directly or claim it migrated from the manual CRUD alone. Full category/Portal management and other remaining employee features remain in the overall objective.
