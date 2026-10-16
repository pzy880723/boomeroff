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

- Backend: Lovable R36 message `umsg_01m51fc0a2e9y8kwyc6q9hytde`; production entry remains closed until final fixed source/DTO review. The candidate DTO may be used for isolated native development while its spending check-in awaits a human decision; that is not a frozen/released backend contract.
- Meitner: completed the pure form helper/tests; now owns only new `miniprogram/pages/activity-edit/*` and `tests/activity-management-pages.test.cjs`, using the actually read candidate DTO. No parent API/preview/routes/list/detail/Git edits.
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
- [x] Add RED tests for route/detail/capability bindings, exact patch and receipt decoding, inline candidate pagination, stale identity/store callbacks and preview-zero-write behavior, using the actual candidate DTO for isolated development.
- [x] Implement the single native editor with explicit create/save/status/delete confirmation; preserve raw originals only in private RAM, render safe view models. Production entry remains closed.
- [x] Confirmed operation freezes original UUID/payload/version. Unknown is retained in App RAM by actor/shop/resource. No automatic resend/new key; status not_found or detail404 never proves failure or deletion.
- [x] On permission recovery, check original status before requiring a live detail row. Confirmed receipt followed by failed readback permits reads only, not another write. Independently reproduced detail500 recovery P2 is closed by12 regression cases.
- [ ] Route existing list/detail to the editor only when fresh capability permits. Existing ordinary activity read/publication flows remain unchanged.

```sh
node --test tests/activity-form.test.cjs tests/activity-management-pages.test.cjs tests/activity-management-api.test.cjs
```

## Task 4: Acceptance And Source Checkpoint

- [x] Run all Node tests and route/syntax check; official WXML/WXSS compilers must exit0 with empty stderr:1532 tests,25 routes,26WXML/27WXSS.
- [x] Capture actual WeChat DevTools synthetic editor/inline voucher selection/field drafting/disabled write states. Recovery/error branches are VM-tested, not claimed as GUI production evidence.
- [x] Independent client review and regression; resolve confirmed client P1/P2 before checkpoint. Two backend candidate P2s remain open separately.
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

The development editor is now implemented and independently reviewed. Page/helper115 and full1532 tests pass; official26WXML/27WXSS compile. Actual DevTools verified type-first select drafting, Chinese option input, inline voucher selection and disabled synthetic mutation controls. Production list/detail entry remains deliberately closed pending R36 repair, registration and acceptance. Existing Web activity-description AI polishing is still a migration item. See the latest section of VERIFICATION.md; the preparation paragraphs below are historical evidence only.

## Historical Preparation Evidence

R36 is now paused at a20.3-credit check-in, not running or accepted as complete. Candidate `a4d6edb0` has two confirmed P2s and no BFF registration/final deployment report; see `ACTIVITY_MANAGEMENT_BACKEND_AUDIT.md`. Parent requested a human budget decision without clicking Continue/Finish up or bypassing the pause. No final backend, migration/deployed-byte equality or native editor integration is claimed. The last implemented UI checkpoint remains official knowledge Q&A source `9be89a09` with docs `8d2bc4bb`; its synthetic DevTools evidence is not real employee or WeChat release acceptance.

Preparation now includes `activity-form.js` plus34 tests and19 API transport tests. The transport suite initially had seven failures (six missing-store guards and one implicit write retry); the final19 and combined40 pass. The API binds all six action names to the verified selected shop and never automatically renews/resends `activity-manage-write` after an error. No page calls these new actions yet. Independent review ran103 related tests and extra21 legacy-date probes; no remaining confirmed P1/P2 in this preparation scope.

Parent freshly ran1442/1442 tests (zero failed/skipped/cancelled),24-route/syntax/JSON/no-H5 check, official25 WXML and26 WXSS compilers (both exit0, empty stderr). No new runtime screenshot, business request or deployment is implied by these local additions. Full editor/DTO/backend acceptance remains open.

Preparation source checkpoint `cd3f785cb7826bf36ae0ff0ff3810c009a71da7c` contains seven Mini-only paths and was nonforce pushed to `codex/go-mini-workbench`; remote readback matched. Archive `/private/tmp/BOOMER-GO-wechat-activity-preparation-20261016.zip` is1060206 bytes, SHA256 `beb1eddabac8904ef1f3efaaf9d6362fe9fd87d38b881a20b0f33bcf81657b66`. Clean extraction `/private/tmp/go-mini-activity-prep-verify-0LA3VT` reran1442/1442 and24-route checks. Normal index remains empty and Flutter/iOS checkout, phone and login data were not changed. Follow-up evidence-only documentation does not change the archived JS/WXML/WXSS. This is not main synchronization, native editor delivery or WeChat publication.
