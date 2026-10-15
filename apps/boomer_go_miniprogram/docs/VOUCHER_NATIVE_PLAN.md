# Native Voucher Plan

Approved direction: employee native flow, Figma SXY4nF6NWwrsw3jxZOIaDU node 6:2.
Owner: only pages/voucher/*, tests/voucher-pages.test.cjs and this document. No Git operations.

## Contract And Evidence

Round 13 began as a proposed main-flow contract. Main later read and independently reviewed fixed backend ref a4b3eb9f99aa13d0672a20df5e9be0718ddcea47; Lovable reported the migration applied and Edge deployed. This worker did not independently run production operations. Only api.action is used. The shared layer owns selected-shop injection and authorization refresh. No direct RPC, legacy Edge redemption, claims-table access or expanded permissions.

Capabilities gate lookup/manage/redeem separately. Lookup responses must match shop and requested code; only masked recipient fields enter view data. Redemption receipts must match request UUID, shop, claim ID and code, with redeemed status, valid server timestamp and redeemed_by_me=true. Only then show confirmed receipt, followed by a separate lookup readback. A failed readback does not erase the confirmed receipt.

Unknown write outcomes freeze the original payload and UUID. Minimal unresolved intent also lives in App-private RAM keyed by verified userId + shopId, never on disk. Neither lifecycle nor generic retry sends a mutation. A not_found status is not proof of failure. A same-key retry requires explicit user confirmation. Hide/unload/identity-store-scope-revision changes isolate callbacks; a hidden scan result waits for onShow under the same picker token and identity.

## UI

Use the existing red/white native design system: current authorized shop, 48px scan button, code input plus read-only query, white voucher card with amount/threshold/status/validity, separate template terms and a second confirmation. No fake navigation bar, new tab, URL navigation, raw recipient PII or invented numeric zero. Preview is prominently marked and never writes.

Accept trimmed eight ASCII alphanumeric bare codes, normalize uppercase. URL inputs accept only HTTPS ai.boomeroff.com, optional :443, exact /me/vouchers/redeem/<8 ASCII alphanumeric> with optional trailing slash. Reject query/hash/credentials/other ports/domains/claim links. No dependency on URL in WeChat.

## Execution

- [x] Add parser, DTO, callback/lifecycle, uncertain-outcome and native markup tests; record the failing run.
- [x] Implement model.js and index.js/WXML/WXSS/JSON. Keep all private request IDs and raw DTOs out of view data.
- [x] Run focused tests and full native suite; compile WXML/WXSS with installed official compilers.
- [x] Report page integration path /pages/voucher/index to main. Route registration, list/mine entries and shared API/preview integration remain main-owned.
- [x] Main GUI screenshots, independent source review and Round 13 contract alignment. No real employee or production acceptance is claimed; exact online bundle bytes have not been read back.

## Verification Log

Initial RED: `node --test tests/voucher-pages.test.cjs`: 19 tests, 0 pass, 19 expected assertion failures (parser/page/native files absent). No production code existed at this run. Backend source/deployment and real-device acceptance are separate outstanding gates.

First GREEN: 19/19 focused tests passed. Official wcc and wcsc compiled the voucher files successfully. First full suite: 314/315 passed; sole failure is the main-owned native-contract test awaiting app.json registration of pages/voucher/index. Static checker passed 16 registered routes. No configuration change was made by this worker.

Boundary RED: 28 focused tests, 24 passed / 4 failed: denied capability refresh, redemption timestamp readback mismatch, invalid calendar date normalization and missing-shop error cleared by input. These are covered before repair. Scan completion before/after onShow, status singleflight/late mismatches, frozen uncertain payload and conflicting request IDs are also covered.

Boundary GREEN: 28/28 passed after repair. Shared-preview integration test uses createPreview, not a page-local fixture, and passes without any mutation. Final authority-refresh RED independently reproduced the old submit button remaining enabled while capabilities reload; the page now invalidates prior permissions immediately and keeps them invalid on service failure.

Uncertain writes keep the code input and scanner disabled until an exact receipt is confirmed. No new key can replace an uncertain pending operation. Only a fresh request's trusted definitive transaction abort can release an uncommitted intent without a receipt, as specified below. On page destruction, page-private data is discarded but minimal unresolved App RAM survives. Fresh lookup showing redeemed is never proof that the destroyed page's request succeeded; only an exact personal request receipt can confirm it.

## Final Frontend Verification / Freeze

- Focused: `node --test tests/voucher-pages.test.cjs`, 30/30 passed. Includes the actual shared preview adapter in explicit read-only mode.
- Full suite after main-owned route integration: 326/326 passed, zero skipped/cancelled.
- `node tools/check.cjs`: 17 registered native routes, JS syntax, JSON and no H5/server-secret markers passed.
- Official voucher WXML and WXSS compilers: both exit 0, empty stderr. Full native compilation was also run at handoff; see the accompanying report for counts.
- Created only pages/voucher/index.js, index.wxml, index.wxss, index.json, model.js; tests/voucher-pages.test.cjs; and this plan. No shared/app/preview/list/mine edits, Git operations, real voucher lookup/redemption or DB access.
- Figma 6:2 design context and screenshot were read before implementation. Native GUI screenshot acceptance remains with the main flow; compilation and synthetic DTO tests are not deployment or business-operation proof.
- Stop writes after this record so GUI navigation/input is not interrupted by HotReload. Backend source/deployment verification remains pending main-flow notice.

## P2 Review Repair: Cross-Page Unresolved Intent

- Root cause: onUnload and 401/403 cleanup removed the only pending UUID, permitting a later same-identity page to generate a new key despite an uncertain prior write.
- RED: VM harness now shares one test App/session across page instances while separate tests get separate Apps. With nine new regressions, 31/39 passed and eight failed before repair (including the actual no_redeem_permission reason).
- App-private `_voucherPending` initially held `{request_id, code, claimId, retryBlocked}` under a userId/shopId key; the definitive-abort repair below adds one monotonic `unknown` boolean. It stores no recipient, template, access token, scope snapshot or receipt, and uses no storage/filesystem API. No app/shared source changes were made.
- Before invoking redemption, record the original intent. Unload, expired authorization and revision changes clear/hide page state without removing that record. Fresh matching capabilities with can_lookup=true are required to restore only pending code/prompt; lookup/status/send are never dispatched by restoration.
- Another user/shop cannot see the record. Same-user login must pass a new capabilities response before seeing it. Existing pages recheck RAM before and after their confirmation modal, so concurrent page instances cannot replace the unresolved UUID.
- An exact receipt accepted by a current visible page removes its matching RAM record. The only non-receipt release is a fresh, never-uncertain request's trusted abort (next section). Detail readback failure retains the confirmed receipt on that page, but reentry does not restore a receipt or claim success from a redeemed lookup. Late unloaded/revision-invalid responses cannot clear the ledger or paint results.
- request_id_conflict remains non-retryable across reentry. An empty personal status result cannot prove that the globally unique key was unused by another caller.
- Main reported Round 13 ref `a4b3eb9f99aa13d0672a20df5e9be0718ddcea47` and the actual manage-only reason `no_redeem_permission`; added its Chinese mapping without changing lookup permissions. This worker did not independently inspect the new backend or access business data.
- GREEN: focused 41/41 passed, including actual 401/sign-out/same-user login and conflicting-key reentry. Static checker passed 17 native routes; official wcc compiled 18 WXML and wcsc compiled 19 WXSS, all with zero failures.
- Concurrent full-suite evidence: first run 344/383 passed with 39 schedule-native-v2 failures; later run 382/383 passed with its sole remaining failure in that same parallel-owned test file. Excluding only schedule-native-v2, 339/339 passed. Do not label the changing full suite all-green from this snapshot.
- RAM does not survive process termination/HotReload, by design; no persistence or permission expansion was introduced. Main already screenshot-checked read-only DEMO1234; mutation/device acceptance remains separate. Stop writes again after this review record.

## P2 Review Repair: Definitive First Transaction Abort

- Root cause: all first failures occupied the sole user/shop pending slot, including RPC responses proving this fresh transaction aborted. A new coupon could not be processed even though this particular intent was definitively rejected.
- RED: 48 focused tests, 40 passed / 8 failed before implementation. Covers first-abort slot release, next coupon both in-page and after reentry, exact status/code matching, unknown-history retries, restored in-flight requests, mismatched receipts and another page restoring before the original abort arrives.
- Exact trusted pairs only: 400/invalid_params; 404/not_found; 409/already_redeemed, void, not_claimed, voucher_unavailable; 410/expired. HTTP status must be numeric and the code must match exactly. request_id_conflict, 401/403, unknown errors and status/code mismatches are never release evidence.
- Only a newly created request with no uncertain history may clear its own matching RAM record on one of these aborts. Clear page pending/claim authority and leave lookupVerified=false/canSubmit=false. No local redeemed status or success receipt is invented. User input and a fresh read-only query are required before another explicit mutation intent/UUID.
- Add only `unknown:boolean` to the existing minimal RAM record. Network failure, mismatched receipt, untrusted error or RAM restoration marks it true. Same-key retry is conservative. The flag merges monotonically, including when another page restores while an original request remains in flight; a later abort cannot erase that history.
- A trusted abort after timeout, restoration or receipt mismatch cannot free the record. Status not_found never frees it. request_id_conflict remains non-retryable under the same key and cannot silently generate a replacement key. 403 still clears private UI while retaining minimal RAM.
- GREEN: focused 48/48 passed. Full suite 395/395 passed, no skipped/cancelled tests. Static checker passed 17 native routes. Official wcc compiled all 18 WXML and wcsc all 19 WXSS with zero failures.
- Changed only voucher/index.js, voucher/model.js, tests/voucher-pages.test.cjs and this plan. No B-scope, shared/app integration, permission, Git, disk persistence or actual voucher-operation changes. Stop writes after this record.
