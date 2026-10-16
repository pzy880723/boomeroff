# Native Store Knowledge Categories

2026-10-16. Continuation of the delegated overnight full employee migration. Existing five-tab visual system, native secondary pages, no WebView. This is a design and execution plan, not a production acceptance claim.

## Scope And Design

Use one secondary native category page from the SOP/QA list. Keep the selected store and type fixed. Display category name, original numeric sort, and current-store/shared label in readable cards. Shared rows are read-only. A separate inline editor contains name and integer sort, followed by explicit save/cancel; destructive removal has its own confirmation explaining that entries remain and become uncategorized. No drag ordering, bulk reorder, automatic category creation, global category editing or role-name shortcuts.

The alternative of cloning Web direct-table mutations is rejected because it lacks current-store binding and error/receipt checks. Extending the entry editor with category management would mix two independent permissions and mutation intents. A separate page preserves the existing entry editor and its unknown-write protections.

Category management requires the existing `shop.kb.category` gate, independently of `shop.kb.write`; all reads retain fresh ERP identity/current-store and original read authority. A read-only category link may be visible to readers, but mutation controls require the server capability. No new role grants, RLS expansion, service-role business reads, or shared-row mutation.

## Frozen Contract

Four go-mini-api actions, all bound to the selected non-null shop UUID and type sop/qa:

- `kb-category-list {shop_id,type,page,page_size:20}` returns `{shop_id,type,items,can_manage,limits,page,page_size,has_more,as_of}`. Order by `sort_order,id`; each item is `{id,shop_id,type,name,sort_order,version}`; only current shop or shared null. Limits are `{name_chars:200,sort_min:-2147483648,sort_max:2147483647}`.
- `kb-category-detail {shop_id,type,id}` returns `{shop_id,type,category,can_manage,limits,as_of}` with the same item shape. Missing is exact 404/not_found. Shared `can_manage:false` regardless of actor.
- `kb-category-write {shop_id,type,request_id,operation:create|update|delete,category_id?,expected_version?,name?,sort_order?}`. Update/delete require UUID and 64-lowercase-hex version. Name is trimmed, required, 1..200 codepoints; sort is a strict PostgreSQL integer. Existing duplicate names remain allowed; no new uniqueness policy. Create always current shop, not shared. Fields may not change shop/type/id.
- `kb-category-write-status {shop_id,type,request_id,operation,category_id?}` returns `{shop_id,type,request_id,operation,requested_category_id,state:not_found|succeeded,receipt:null|receipt}`. A deleted target must not prevent checking the original receipt.

Receipt is `{shop_id,type,request_id,operation,actor_id,category_id,version,deleted,recorded_at,replay}`. All bindings must match; version hashes the canonical persisted category fields. Write and metadata-only receipt are atomic. Idempotency is actor/request scoped; changed payload conflicts. No names/bodies/tags/PII in receipts. Status and replay require fresh/current identity and original category permission.

Delete only local same-type categories. Lock the category compatibly with existing entry-save category locks. Reject `409/category_reference_conflict` before mutation if any legacy reference belongs to another shop/type/shared row; never silently SET NULL across those boundaries. For valid local references preserve entries and rely on existing FK SET NULL, atomically with receipt. Existing entry version/CAS detects changed category binding; do not rewrite pending entry payloads.

Errors must preserve status/code; no raw SQL/provider details. Explicit first never-unknown transaction aborts may release only a frozen, documented whitelist; any unknown timeout, 401/403, 500, malformed receipt or request-key conflict retains original UUID/payload. Status is read-only; no automatic resend. Successful status/receipt still requires category detail equality, or delete plus exact 404, before success. Pending intent remains minimal user/shop/type/resource App RAM, not process-restart persistence.

## Ownership And Execution

- [x] Source audit: local KbManager has numeric sort only and separate category permission; current AI/backend checkpoint is e564fc300f51aa072e73da7c2d1b32203603a1c5. No real business/AI/OTP requests.
- [x] Lovable: R25/26 terminal reports and fixed-source readback confirm four narrow RPC/actions and metadata-only receipts. Reports 0021/0022 applied, R25 Edge deployed, SQL68 forced rollback and Deno110/Vitest5; R26 is SQL-only and does not redeploy unchanged Edge. No actual business/provider writes in acceptance.
- [x] Client TDD: one native page/model/route, initial21 failures plus2 boundary failures, two loading P2 regressions, four initial-abort groups and one cross-resource conflict group observed RED then GREEN. Final category36 tests and main800 tests pass; the later detail500 supplementation was already GREEN and changed no production code.
- [x] Main shared TDD: three expected failures observed before implementation; four new category tests and 31 existing API/preview tests pass. All four actions bind to selected shop, missing scope rejects before IO, and ordinary/OTP timeout is unchanged. Preview uses labeled synthetic read fixtures and rejects writes/status. Independent shared review found no confirmed P1/P2; it does not replace backend review.
- [x] Independent final review: fixed813c128 source/0022 hash checked; category36/API4/actual handler7, three offline delete interleavings and both original loading reproductions pass. No confirmed new P1/P2; both earlier P2 closed at source/mock level, not live PostgreSQL/device acceptance.
- [x] Main reran800 Node tests,23-route static check and official24WXML/25WXSS with exit0/empty stderr. Actual native category list, Chinese draft input, numeric sort and shared-readonly screenshots checked; preview disabled mutation. These are synthetic GUI/mocks, not real employees or phones.
- [ ] Update current parity/verification/docs, commit only Mini paths through the dedicated alternate index, nonforce push and remote readback, regenerate archive and verify it independently.

Manual source edits use apply_patch. Parent Flutter/iOS checkout, its normal Git index, main/Lovable sync and customer Mini Program remain untouched. Missing AppID/privacy/legal-domain/device gates remain explicit.

## Review Evidence

R25 fixed source b3def8e98b2202e22cd379481374783014e5745c is read back and its five source hashes match the deployment report. Lovable reports 0021 applied, Edge deployed, 67 synthetic forced-rollback SQL checks and 110 Deno/5 Vitest checks; main did not run privileged SQL. Independent actual handler tests pass 7/7. Existing server compatibility permits list page size 1..50 (native always requests 20), omitted create sort defaults to zero, omitted update sort preserves it, and shared mutation returns safe 404/not_found rather than revealing a shared write target.

Independent review confirmed two P2 issues: category delete checked reference scope before acquiring all entry locks, and confirmed receipt restoration could retain loading after advancing the page epoch. R26 fixed source813c12840f12a904fd07e6bc3a8bb08359b01090 adds0022 post-lock scope check, not an edit of applied0021. Client regression and initial known-abort recovery now pass. The exact known-abort whitelist is six status/code pairs:400/invalid_params,404/not_found,409/version_conflict,409/category_reference_conflict,422/name_too_long,422/invalid_sort_order. It never applies to historical unknown requests, status reads, malformed receipts,401/403,500 or request_id_conflict. Final independent fixed-source review closed both earlier P2 at source/mock level; it is not a real two-session SQL or employee acceptance.

Main reran the pre-repair 790 tests, 23-route check and official 24 WXML/25 WXSS compiler successfully. Actual DevTools preview traversed the native list and own/shared inline editor, entered the Chinese local draft `开店核对（合成草稿）` and integer `-2`, and confirmed preview save/delete are disabled. The three original screenshots and phone crops are in local ignored evidence/native-kb-category-*.png. They prove synthetic controls/input, not real employee permission, saving, PostgreSQL concurrency or device acceptance.
