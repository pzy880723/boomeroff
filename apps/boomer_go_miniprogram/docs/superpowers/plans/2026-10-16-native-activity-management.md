# Native Activity Management Implementation Plan

> **For agentic workers:** Execute the ownership-scoped tasks below with TDD and independent source review. Never stage the parent's unrelated Flutter/iOS changes.

**Goal:** Complete current-store native activity creation, editing, explicit active/draft changes and deletion without changing public signup or issued vouchers.

**Architecture:** Reuse the existing native activity list/detail and add one editor route. The existing GO Lovable backend owns caller-RLS reads and atomic CAS writes with private original-request receipts. Keep the five native tabs and same identity/effective-store boundary; no H5 fallback.

**Tech Stack:** WeChat WXML/WXSS/CommonJS, Node VM tests, existing GO Edge Function and additive Postgres migration.

## Design And Scope

- Editable Figma file `SXY4nF6NWwrsw3jxZOIaDU`: `26:2` current-store list, `26:22` editor/voucher selection, `26:46` uncertain result/recovery. Parent rendered and inspected all three at 390x844. These are explicitly synthetic design examples, not runtime evidence or new implemented pages.
- Reuse approved red/white styling and native navigation. One new `/pages/activity-edit/index` route, with inline existing-voucher selection. Do not replace application evidence/publication flows.
- R35 fixed Web source `2412d851859a95b733b0b1e8ee36e21f6b84dc71` was read-only audited. Actual gate reference is `drizzle/migrations/0019_go_kb_maintain_native.sql`, not `supabase/migrations/...`; parent read lines26-37 directly.
- Staff must match today's non-NULL effective store, not merely any member of authorized_shops. HQ selects only within its existing authorized scope. Activity management still requires existing `voucher.manage`, not KB authority.
- Existing shared/NULL-template HQ binding, voucher maintenance/issuance, pending review/SMS and poster/share remain part of full-role migration after this coherent current-store step. Do not call them completed.
- R27 content-home approval remains separate and untouched.

## Ownership

- Backend: Lovable R36 message `umsg_01m51fc0a2e9y8kwyc6q9hytde`; no client integration until final fixed source/DTO review.
- Meitner: only `miniprogram/shared/activity-form.js` and `tests/activity-form.test.cjs` initially. Pure lossless draft/patch/date helpers, no guessed wire envelope.
- Mill: read-only independent backend/contract audit, no writes or business data.
- Parent: plan, API/preview/routes/list/detail integration and verification; assign editor ownership explicitly after DTO freeze.

## Task 1: Freeze And Verify The Backend

- [x] Read R35 result and source-based independent review. Confirm deletion cascades applications while issued claims remain; no real deletion test.
- [x] Render native editor design before implementation.
- [x] Request additive R36 six actions: capabilities, list, voucher candidates, detail, write, write-status.
- [ ] Read final source and exact DTO at fixed SHA; independently recompute raw UTF-8 hashes and inspect the diff.
- [ ] Verify caller-RLS reads, current effective-store checks, strict parameters, old/new sorted voucher locks, activity lock, post-wait authorization, CAS and actor/request/payload receipt ordering.
- [ ] Verify delete status does not require the deleted activity row; rebind denies without cross-store data. Old inactive/soft-deleted voucher does not block unrelated edits; actually selecting a new voucher requires active/nondeleted/same-store eligibility.
- [ ] Replay actual handlers using synthetic inputs. Record Deno/SQL/deployment as owner-reported until independently executed; serial tests are not true concurrency proof.

```sh
node /private/tmp/go-mini-r36-audit/replay-tests.cjs
```

The audit runner is created only after actual final test source is read. No employee authentication, SMS, paid model or business mutation is allowed for verification.

## Task 2: Lossless Local Drafts

- [x] Write and observe RED tests before adding the helper (worker31 RED to31 GREEN).
- [x] Deep-clone JSON without prototype mutation; preserve key/order/options/placeholder/role/unknown metadata. Unknown legacy type/role is retained, not silently converted.
- [x] Produce only explicitly changed top-level fields. Omission is not NULL. Untouched malformed legacy form/status/requires_review and date precision survive basic edits.
- [x] Date inputs use Shanghai time independently of machine timezone. Validate the final range only for creation or actual date changes; unrelated edits retain historical NULL/invalid dates.
- [x] Observe GREEN and review helper exports before editor use. Parent and independent reviewer reproduced a P2 from unconditional range validation; two new RED regressions then GREEN close it. Final focused34 tests and independent five original reproductions plus16 boundaries pass. This is helper verification, not editor integration.

```sh
node --test tests/activity-form.test.cjs
```

## Task 3: Native Editor And Recovery

- [ ] Freeze final actual backend envelope before tests/client implementation.
- [ ] Add RED tests for route/detail/capability bindings, exact patch and receipt decoding, inline candidate pagination, stale identity/store callbacks and preview-zero-write behavior.
- [ ] Implement the single native editor with explicit create/save/status/delete confirmation; preserve raw originals only in private RAM, render safe view models.
- [ ] Confirmed operation freezes original UUID/payload/version. Unknown is retained in App RAM by actor/shop/resource. No automatic resend/new key; status not_found or detail404 never proves failure or deletion.
- [ ] On permission recovery, check original status before requiring a live detail row. Confirmed receipt followed by failed readback permits reads only, not another write.
- [ ] Route existing list/detail to the editor only when fresh capability permits. Existing ordinary activity read/publication flows remain unchanged.

```sh
node --test tests/activity-form.test.cjs tests/activity-management-pages.test.cjs tests/activity-management-api.test.cjs
```

## Task 4: Acceptance And Source Checkpoint

- [ ] Run all Node tests and route/syntax check; official WXML/WXSS compilers must exit0 with empty stderr.
- [ ] Capture actual WeChat DevTools current-store synthetic list/editor/inline selection/error states. Do not replace runtime screenshots with Figma or AI images.
- [ ] Independent review and regression; resolve confirmed P1/P2 before checkpoint.
- [ ] Check alternate-index diff contains Mini-owned paths only; verify normal index remains empty. Commit/push nonforce to `codex/go-mini-workbench`, read remote SHA back, archive source and rerun in clean extraction.
- [ ] Update feature parity and evidence with exact source, test counts, archive hash and residual real employee/device/AppID/release gaps.

```sh
npm run check
npm test
```

## Non-Negotiable Semantics

- Opening a draft/closed/unknown activity must never activate it. Create uses active/draft and backend-owned `requires_review=false`; an update leaves unedited legacy values intact.
- New form fields follow the existing six types/two roles. Preserve unknown existing metadata; reject unsafe changes rather than deleting keys during sanitization.
- Delete confirmation: "删除后该活动所有申请记录将一并清除，已发放的优惠券仍然有效。此操作不可恢复。"
- No new mandatory public review, no coupon cancellation, no SMS, no service-role business reads, no new broad grants or RLS expansion.
- Existing unrelated table ACL concerns and noncooperating Web writers remain explicit residual risks, not claims of exploitability or universal concurrency safety.

## Current Evidence Boundary

R36 is accepted/running; no final backend source, migration result, deployed-byte equality or native editor integration is claimed here. The last implemented UI checkpoint remains official knowledge Q&A source `9be89a09` with docs `8d2bc4bb`. Its synthetic DevTools evidence is not real employee or WeChat release acceptance.

Preparation now includes `activity-form.js` plus34 tests and19 API transport tests. The transport suite initially had seven failures (six missing-store guards and one implicit write retry); the final19 and combined40 pass. The API binds all six action names to the verified selected shop and never automatically renews/resends `activity-manage-write` after an error. No page calls these new actions yet. Independent review ran103 related tests and extra21 legacy-date probes; no remaining confirmed P1/P2 in this preparation scope.

Parent freshly ran1442/1442 tests (zero failed/skipped/cancelled),24-route/syntax/JSON/no-H5 check, official25 WXML and26 WXSS compilers (both exit0, empty stderr). No new runtime screenshot, business request or deployment is implied by these local additions. Full editor/DTO/backend acceptance remains open.
