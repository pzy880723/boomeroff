# Native Activity Publication Confirmation

## Scope And Evidence

Approved style: Figma SXY4nF6NWwrsw3jxZOIaDU / 6:3 (design context and screenshot inspected). Keep the five tabs, red #EB0029, white cards, 16px primary text and >=44px controls. Do not recreate the native navigation bar or embed the design screenshot.

Reference: OPERATIONS_NATIVE_PLAN Step 2; local Web src/pages/ActivityDetail.tsx, src/components/voucher/PublishConfirmDialog.tsx and src/lib/voucher.ts. These are references, not proof of Round15 deployed behavior. User-provided baseline: 0cc0da0a / 414 tests; no Git verification or baseline claim is inferred.

Latest ownership: A only pages/application/*, tests/application-pages.test.cjs and this document. B owns pages/activity/* (root activity details and application list). Main owns app/shared/list/preview and route integration. Do not edit voucher or create a generic shared pending helper.

The operation changes publication confirmation and its note/link/evidence references only. It is NOT activity-review approval, coupon issuance/redemption, SMS, activity creation/deletion or social-platform publishing. It must not change application approval, voucher_claim_id or send messages. A paused activity is not a void coupon. Do not require a link/image or approved application status without the existing server rule.

## Frozen Stage1 Interface / Source Gate

Main froze the following interface and reports Mill verified migration 0015 at fixed ref 171330bf87cfa05885edb89d28ce2cc6a8b3b5ec, including current activity relation, replay/status binding and exact abort pairs. This worker's mocked tests do not independently verify deployment.

| Action | Params | Result / Validation |
| --- | --- | --- |
| activity-capabilities | shop_id | shop_id, can_manage, can_confirm_publish, can_upload_evidence:false |
| activity-applications (B) | shop_id, activity_id, publish_confirmed?:bool, limit:20, cursor? | scope/filter echoes; items with masked applicant summary; next_cursor, has_more, order:'desc' |
| application-detail | shop_id, application_id | shop_id; application; activity; version (64 hex); server_time ISO |
| publication-confirm | shop_id, activity_id UUID (required), application_id, request_id UUID, expected_version, target_confirmed, note, url, screenshots (original path members) | request_id, shop_id, activity_id, application_id, target_confirmed, confirmed_at, confirmed_by, version (64 hex), replay:boolean |
| publication-confirm-status | shop_id, activity_id UUID (required), application_id, request_id | state:not_found OR state:succeeded plus the original minimal receipt |

No actor/userId/client time in mutation params. Server takes the actor from verified auth, owns time/version, revalidates selected shop and atomically commits CAS transition + caller/payload-bound idempotent receipt. Source review must confirm replay ordering (a committed same-key replay must not fail merely because its old expected_version is now stale), own-caller status visibility, privacy projection, path membership and exact abort codes. No new grants/RLS access to applications or arbitrary signing.

Detail: application contains id, activity_id, status, created_at, reviewed_at, masked name/phone tail, voucher_claim_id; publish contains confirmed, confirmed_at/by, note, url, screenshots[{path,signed_url,error}]; answers[{key,label,type,role,value,image}]. activity contains id,name,platform,form_fields. Route /pages/application/index?id=<applicationuuid>&activityId=<activityuuid> requires BOTH UUIDs and a verified selected shop before any API call. Then caps must succeed with can_manage=true before detail; write additionally requires can_confirm_publish=true. No local role guesses.

Validate shop, both application/activity joins, server_time and version before accepting detail. Treat 401/403 as private-state invalidation, not empty success. Missing/unreadable resource remains a real error. Current 401 delegates to shared run; stale identity/revision 401 cannot log out the new session.

## Privacy / Correct Web Field Semantics

- Actual ActivityField types: text | phone | url | image | textarea | select. Actual special roles: profile_screenshot | xhs_profile_url only; applicant_name/phone are TOP-LEVEL application fields, not form roles.
- Main/B corrected the Lovable candidate audit on these facts. Fixed backend source must be checked against them before calling privacy projection verified.
- Render only explicit safe view models. No raw form_data, profile fields, arbitrary keys, __profile_check, reviewer payload or JSON dump. Known answers must correspond to declared form_fields key/type/role; phone is masked by TYPE, not a fabricated role. Top-level name/phone use masked fields only, with no fallback to applicant_name/applicant_phone.
- Text is native escaped text, not executable markup. URL answers/publish links are display plus explicit copy only, no fetch, web-view, browser or external navigation. Raw phone values must not enter view data even in malicious DTOs.

## Native Flow And Draft Rules

1. B paints activity detail, requests manage caps, then a stable cursor application list. List rows show only masked summaries and a native application route. Changing shop/activity/filter resets cursor; append only matching echoes, dedupe by id, obey has_more, and retain loaded rows on a later-page failure. Opaque cursor must stay server-owned. Cursor pagination is not proof of a frozen snapshot; never invent snapshot IDs or global totals from loaded rows.
2. A loads caps then one application detail. Header shows activity/store, masked applicant and publication status, distinct from approval/coupon state. White editable cards show publish URL, optional note and existing publication screenshots. Applicant form evidence is separately labeled read-only.
3. Stage1 allows keep/remove ORIGINAL publish paths, including signed_url:null, sign_failed or path_not_allowed. Removal is an explicit draft edit, not object deletion. Never mix answer/profile evidence into publish screenshots. No new path/upload in Stage1, no invented total-nine limit. Keep the original canonical path even when preview is unavailable; signing failures must never silently shorten the write array.
4. Trim note <=200 and URL <=500 Unicode code points (Array.from), matching Round15 parseConfirm, not UTF16 length. Empty URL is valid; a nonempty URL requires a valid HTTP(S) host/port using deterministic native validation without global URL. Do not truncate existing values silently or lowercase/rewrite URLs/paths. No requirement for screenshots/link. Do not send unrelated properties from the detail DTO.
5. Targets are explicit true (save/confirm) and false (revoke publication confirmation). Both require a modal describing activity, application, store and target; false also saves note/URL/paths, with server clearing actor/time. Closing the editor or cancelling the modal makes ZERO mutations and is not target=false.
6. Modal callback rechecks current visible page, same user/shop/revision/application, draft generation, expected version and capability. No auto-save, polling or auto-mutation. Preview always blocks writes, even when synthetic caps allow confirmation.

## CAS, Receipt And Readback

- expected_version is the exact 64-hex version from the accepted editor baseline, never a client timestamp or a silently adopted later value. Freeze activity_id + request UUID + version + explicit target + normalized note/URL/path members before dispatch. Same payload/key only on an explicit retry confirmation. Both confirm and status require the frozen activity_id; receipt activity must match payload, captured route and RAM metadata. Backend must bind current application/activity relation, payload hash, replay and status; an activity mismatch is not_found, not a new intent.
- Receipt must match request_id/shop/activity/application/target, valid 64-hex resulting version and boolean replay. For true, confirmed_at must be valid zoned ISO and confirmed_by must equal the captured current userId. For false, both are null; identity proof relies on the verified current caller plus backend own-caller receipt/status binding (the minimal receipt has no separate cancelling actor field; do not invent one).
- A current matched receipt confirms THIS operation, not merely an application that happens to be confirmed. Then independently re-read detail and check resulting version plus all six publication fields: confirmed, confirmed_at, confirmed_by, normalized note, URL and original-path member array. New intents deduplicate screenshot members in first-seen order before freezing. Historical RAM payloads retain every original member and byte-for-byte retry shape; compare a separate ordered-deduplicated view of both original payload and server screenshots for readback. Do not sort, rewrite RAM, rebuild a request or change its UUID to accommodate server deduplication.
- Only matching readback ends the editor as saved. A readback failure keeps the in-page confirmed receipt and freezes further writes: show '本次操作回执已确认，详情回读失败', offer read-only retry. Never create a new UUID. A newer conflicting server version is '当前记录已变化', not proof this operation failed; never overwrite a colleague's state or silently rebase.
- Returning from wx.previewImage triggers fresh caps/detail reads, without dropping a dirty note/URL/evidence draft. Same version may refresh only signed preview URLs. A changed version disables writes and presents explicit '载入最新并放弃当前修改' confirmation; cancelling keeps the draft but cannot submit. Refresh is never implicit CAS adoption.

## Unknown Requests / App-Private RAM

- Use App-private RAM namespace separate from vouchers, keyed by verified userId + shopId + applicationId, carrying activityId. No disk, logs, analytics or global raw application cache. Same test App across page instances exercises recovery; each independent test uses a new App.
- Latest user authorization requires the FULL normalized frozen write intent in RAM: request UUID, expected_version, explicit target, note, URL and original screenshot paths, with minimal scope IDs and monotonic unknown/retryBlocked flags. Do not retain answers, recipient/profile PII, signed URLs, templates or receipts. These user-authored fields are retained only for exact reconciliation/retry, not as an alternative detail cache.
- Save before dispatch. Network/unknown error, malformed/mismatched receipt or restoration makes unknown=true permanently for that intent. Hidden/unloaded/revision-invalid callbacks cannot paint results or clear its record. 403 hides/disables private UI but cannot prove no commit; keep intent. Different users/shops/applications see nothing from that record.
- On return, require fresh same-shop caps AND fresh matching detail before exposing any restored intent/draft. Restore a read-only pending editor and an explicit status button, not a send. A missing or inconsistent activity_id in historical RAM cannot be silently upgraded: retain the record, hide the editor and block status/retry. A new server version cannot alter the frozen expected_version. Status not_found is NOT failure/cancellation and cannot justify a new key.
- Explicit same-key retry uses the exact frozen payload and a second modal. request_id_conflict forbids same-key retry, not permission to create another key. Preview and hidden state never send. Same-user relogin clears old UI immediately and requires new authority before recovery.
- Fresh definitive abort: release only a first newly created never-unknown intent after an EXACT trusted numeric status/code pair: 400 invalid_params; 404 not_found; 409 version_conflict; 422 screenshot_not_allowed/note_too_long/invalid_url. These six pairs follow main's Mill-verified 0015 report, not the voucher whitelist. Numeric status and exact code are both required. Optional pre-RPC 400 shop_required is deliberately not included. Even a trusted abort cannot release historical unknown/restored intents. Never free on 401/403, request_id_conflict, db_error/internal, transport failure, status not_found, mismatched status/code or guessed message text.
- On a permitted first abort, retain current draft, invalidate old lookup/version authority, require a fresh server read before another confirmation and clear only this intent's RAM. All retries remain explicit. A matched receipt clears RAM; failed readback retains only the page-local receipt. Reentry reads current publication state without claiming the prior operation as a new success.
- Reuse the verified voucher lifecycle/monotonic-unknown patterns by local implementation only; do not edit voucher or extract a shared helper for Stage2. RAM ends with process termination; this is not durable cross-restart recovery.

## Evidence Preview / Complete Stage2 Target

Stage1: only wx.previewImage on validated HTTPS, same-project private signed image sources whose exact path matches the returned member AND publish/<applicationId>/ for publication evidence or activity/<activityId>/ for answer images. Reject foreign prefixes, traversal and incorrect signed object binding even if the backend regresses. No arbitrary-path signing, direct storage client, public URL conversion or URL navigation. Treat unavailable/expired images as unavailable, preserve their paths and all draft fields. Fresh detail can update signatures without adopting another version. A legacy unbound path is retained but cannot be signed merely because it has a plausible prefix. Exact signed-source validation follows the parent's contract; do not weaken it to make a legacy image open.

Stage2 remains a full goal, not removed: explicit album/camera original-image selection, native preview, binding-safe original upload, stable uploaded path receipt, add/remove publication evidence references, upload retry and correct filename/extension. It waits for an application-bound parent upload/signing contract and can_upload_evidence=true; Stage1 renders no functional upload button.

Picker token is independent of visible epoch and includes user/shop/revision/activity/application/editor generation. choose -> onHide -> result -> onShow may occur. A hidden result is only parked; NO upload or permission request starts hidden. On visible return, require same token/identity and fresh authority before applying/uploading once. Unload/scope change discards result; cancellation preserves draft. Failed upload preserves prior paths and local draft; upload succeeded/signing failed preserves the bound path, not a false upload failure. No arbitrary path, cross-shop file binding or automatic storage deletion. Size/type/count limits require the exact later upload contract, not guesses from picker limits.

## TDD Plan And Ownership Handoff

- [x] Read Step2, Web reference, field roles and Figma 6:3; record frozen interfaces and source-verification gaps before production edits.
- [x] A: create tests/application-pages.test.cjs first; observe RED before pages/application/index.js, model.js, WXML/WXSS/JSON. Parent registers /pages/application/index and B only links UUIDs, never trusted applicant data.
- [x] Verify UUID + shop preconditions zero API, strict caps-before-detail, mismatch rejection and every raw-PII field denied. Include the actual shared read-only preview DTO and both signing-error paths.
- [x] Verify note/URL limits and normalization, original-path retention/removal, no evidence-count invention, dirty signature refresh, version conflict and explicit reload without silent overwrite.
- [x] Verify true/false modal cancellation, duplicate singleflight, payload whitelist without actor/time, exact receipt fields, six-field readback, failed/conflicting readback and no third-party success inference.
- [x] Verify App-RAM timeout/unload/403 recovery, per-user/shop/application isolation, status-only restoration, exact same-key retry and conflicting-key blocks; all errors outside the verified pairs remain conservative.
- [x] Main reports Mill closed both backend P2s at fixed migration 0015 / 171330bf87cfa05885edb89d28ce2cc6a8b3b5ec. Enable only the six exact first-abort pairs above. RED then GREEN verifies draft retention, authority invalidation, fresh caps/detail before a new UUID, historical unknown/restored nonrelease with identical retry payload, and all excluded/mismatched errors remaining pending.
- [x] Verify hide/unload/revision and late current/stale 401 boundaries; old 401 cannot sign out the new session. Image preview return revalidates without draft loss. Stage2 later adds choose-hide-result-show tests, hidden zero upload, original extensions, bound upload/signature failures.
- [x] Run focused/full tests, static checks and official compilers. Main GUI screenshots and independent review remain separate; no edits outside ownership.
- [ ] Source/deployed DTO alignment and authorized real-employee/device acceptance remain separate. No actual application mutation, evidence upload, approval, coupon issuance, SMS or external browsing during simulated verification.

## Current Status

Design document completed before page/test implementation. Existing shared preview supplies activity ...031 / application ...032, example-shop, version '1' x64, masked answers and unavailable image signatures; all preview confirmation/status/invoke mutations remain unavailable. Use it explicitly, never as production fallback. Main reported initial Stage1 ref 2c1566fecb7a78c02924cb3f349a2340d84f9a5d / migration 0014, then Mill-verified fixed ref 171330bf87cfa05885edb89d28ce2cc6a8b3b5ec / migration 0015 closing activity binding and privacy projection P2s. Main also reports GUI acceptance with eight screenshots. This worker used those reported source conclusions and frozen DTO corrections, not independent deployment, SQL or GUI verification. No claim of employee mutation E2E or existing approval-flow migration is made.

## TDD And Freeze Evidence

- Initial RED before production files: 22/22 expected assertion failures, missing native application page. First GREEN: 22/22.
- Additional RED: old image-preview callback opened after a new user independently loaded the page; loading inputs were not visibly disabled. Both fixed; no old callback can operate on the new session.
- Main review RED: incomplete HTTP(S) URLs passed; same-project/exact-path images from a foreign application or wrong evidence category were available. Deterministic host/port validation and explicit application/activity prefix binding fixed both while retaining all original failed paths.
- Round15 correction RED: 200 emoji note was wrongly rejected by UTF16 length. Array.from-based limits now accept 200/500 code points and reject 201/501.
- Final strict-schema RED: an array containing a UUID was coerced by regex and made two requests. UUID route params and detail/receipt versions now require actual strings.
- Activity-binding RED: 33 tests, 25 passed / 8 failed. Additional duplicate-evidence RED: 36 tests, 25 passed / 11 failed. Required activity_id now binds both requests, RAM restoration and receipts. New-intent ordered deduplication and historical-payload canonical readback now pass while retry payload/key remain exact.
- Verified first-abort RED: 39 tests, 37 passed / 2 failed before enabling the exact six pairs. GREEN: 39/39. The original conflicting-key/no-whitelist test was retained and updated to the new exact-pair contract, including strict negative status/code checks.
- Latest focused: 39/39 passed; latest complete native suite: 502/502 passed, zero skips/cancellations. Static checker passed 19 registered routes. Installed official wcc compiled 20 WXML and wcsc compiled 21 WXSS, zero failures.
- Files created only in A ownership: application/index.js, model.js, index.wxml, index.wxss, index.json; tests/application-pages.test.cjs; this document. No shared/app/list/detail/voucher/B-scope edits, Git operations, real application mutations, SMS or evidence uploads.
- Stop writes after this record for main integration. Stage2 upload and authorized employee mutation/device acceptance remain explicit open gates, not fake completed features. First-abort release is now enabled only under the verified narrow policy; no shared helper or other-module edits were introduced.
