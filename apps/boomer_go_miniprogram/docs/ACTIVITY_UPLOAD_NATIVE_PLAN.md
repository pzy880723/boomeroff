# Native Activity Original Evidence Upload Plan

**Goal:** Complete the approved native application editor with explicit original-image selection, local preview, application-bound private upload, recoverable per-file states, and publication confirmation without losing drafts or existing evidence references.

**Status:** Application-only implementation and synthetic TDD completed against main's frozen local adapter signatures and docs/ACTIVITY_UPLOAD_PROTOCOL.md. Backend source/deployment alignment, real uploads and actual GUI/device verification remain separate. User reports previous Stage1 source pushed as 43eb32eb with 502 native tests; this worker did not perform Git verification or operations.

**Architecture:** Extend the existing application Page/definePage lifecycle and its local model. Keep picker identity separate from visible-request epoch, and upload intents separate from publication-confirm intents. Use only main-owned shared capabilities and upload/status adapters after their exact behavior is frozen; do not create a generic shared pending helper or copy the DM transport.

**Stack:** Native WXML/WXSS/JS, wx.chooseMedia, wx.previewImage, existing session revision checks and App-private RAM. No H5, browser, direct Storage client or new page route.

## Ownership And Read Evidence

The initial planning pass wrote ONLY this document. Main subsequently authorized application-only code and tests after freezing adapter signatures. No app/shared/preview/backend/business-record/Git changes and no real employee files or mutations by this worker.

Implemented edit scope: miniprogram/pages/application/index.js, model.js, index.wxml, index.wxss; application-local uploads.js (picker/upload lifecycle and separate RAM ledger), upload-model.js (strict fingerprint/intent/attestation/status projection); tests/application-pages.test.cjs and new tests/application-upload-pages.test.cjs; this document. index.json is unchanged. These modules are application-specific, not a generic shared pending helper. Main owns the shared API, transport, preview, app configuration and integration; B owns activity root/list. Chat, voucher and other modules remain unchanged.

Local reads for this plan:
- docs/ACTIVITY_NATIVE_PLAN.md: Stage1 authority, six-field CAS, exact receipts, monotonic unknown RAM and complete Stage2 goal.
- docs/DESIGN.md and docs/OPERATIONS_NATIVE_PLAN.md: red/white native employee system, original reference preservation, no invented nine-image total and separation from review/claims/SMS/social publishing.
- docs/GO_MINI_API_CONTRACT.md: current Stage1 still advertises can_upload_evidence:false and accepts only current original screenshot members. It does not yet authorize new native upload paths.
- miniprogram/pages/application/index.js and index.wxml: existing private state is cleared from view on hide; fresh caps/detail preserve dirty baseline and draft unless the user explicitly adopts latest.
- miniprogram/pages/chat/index.js, chooseAttachment/pickerCurrent/resumePicker: selection token survives hide, checks identity/revision independently of visible epoch, and consumes a settled result once.
- tests/direct-messages.test.cjs: choose-hide-result-show, show-before-result, identity/unload rejection and hidden cancellation cases. These are lifecycle references, not proof that DM upload retry/idempotence is suitable for activity evidence.

Approved visual source remains Figma SXY4nF6NWwrsw3jxZOIaDU / 6:3 with its existing upload tile. Main reports supplementary state writes failed twice and produced no new frames. Existing editable 6:3 plus this detailed state plan are the implementation reference; do not claim new frames. Retain #EB0029, white evidence cards, muted secondary text, 16px body and >=44px actions. No new tab or replacement navigation bar.

## Frozen Local Adapter / Implemented Binding

Main froze five methods, each with optional final options `{isActive: () => boolean}`. Application supplies the callback on every call; it captures visible epoch, current user/shop/scope/revision, editor and specific file flight. Main owns after-await and immediate-before-external-phase enforcement; no abort handle exists and the page never claims the network stopped.

- inspectPublicationFile(filePath, options) returns private file_path/format/byte_size/digest_sha1/name. Preserve the selected original filename rather than replacing it with a temp basename. Header bytes, not suffixes, determine the upload format in main's adapter.
- createPublicationUpload(binding, fingerprint, requestId, options), where binding is exactly shop_id/activity_id/application_id and fingerprint is exactly format/byte_size/digest_sha1. No local path/name/actor/time in create params.
- transferPublicationFile(frozenIntent, file, onProgress, options) uses the unchanged flat server-issued intent and original local file. Only `{transferred:true,intent_id,path}` is accepted as a transport receipt, never as verified evidence. Progress is the real progress/totalBytesWritten/totalBytesExpectedToWrite callback; transfer100 is not ready.
- commitPublicationUpload(frozenIntent, options) must return a flat verified receipt matching actor/shop/activity/application/request/intent/path/format/size/SHA1/expiry plus valid object UUID/version, lower-case SHA256, boolean replay and matching preview.path. Only state verified creates a new eligible reference; consumed requires independently current associated membership and cannot mean this page published successfully.
- publicationUploadStatus(params, options), params shop_id/activity_id/application_id/request_id plus known intent_id only, returns normalized scope/request/state, nullable intent and nullable receipt. Application never reads raw backend nesting. Missing/contradictory fields fail closed.

The accepted capability requires strict boolean can_upload_evidence plus exact upload_policy: max_bytes 10485760, max_pending 9, intent_ttl_seconds 600 and all seven jpg/png/webp/gif/heic/heif/avif formats. Nine limits new pending intents, never existing references. Expiry decisions come from server states, not the device clock. No upload URL/token is returned or consumed; caller-JWT direct Storage transport remains exclusively main-owned.

Unknown create can reconcile without intent_id. After explicit status and another modal, not_found retries create with identical UUID/fingerprint; pending continues the fixed no-overwrite transfer; uploaded_unverified commits without retransferring. Every retry re-inspects unchanged local bytes. Verified status restores an eligible mapping; expired/object_changed/unassociated consumed block association and offer explicit omission of that reference, never deletion or a success claim.

App-private upload RAM retains only per-file binding, actor/request identity, local file descriptor/fingerprint, flat intent and inclusion/unknown flags. No signed URLs, attestation SHA256/object receipts, image bytes, applicant fields or disk storage. Hide/reentry retains eligible-path knowledge but makes it read-only pending explicit status after fresh caps/detail. Publication pending RAM and frozen payload, including new_evidence_intents, remain separate and exact across reentry. Only actually retained new paths contribute ordered-deduplicated new_evidence_intents; no-new-image writes omit the optional field to preserve v2 behavior.

## Contract Freeze Gate

The initial read-only audit was umsg_01m50ncy1he628hqt92xx0j0p7. Main now coordinates backend implementation umsg_01m50nwzmwewa8f3w8rc2wy9sd and final normalized DTO/source alignment. No deployment claim follows from this local adapter freeze. The checklist below records the original source-verification requirements; protocol decisions are now fixed by ACTIVITY_UPLOAD_PROTOCOL.md, while deployed-source verification remains main-owned. Do not issue competing backend instructions.

| Required source-reviewed fact | Implementation consequence |
| --- | --- |
| Exact upload capability and authorized roles, with current user/shop/activity/application checks on every write/replay/status | No local role guesses, extra grants, broad row reads or using can_manage alone as upload permission. Current false means no functional uploader. |
| Allowed image encodings, byte-signature/MIME/extension handling, actual per-file byte/pixel limits, and native multipart/binary transport | Do not infer limits from DM's 40MB, recognition's five photos, Web input hints or picker count. Preserve original bytes; reject unsupported originals with an explanation rather than secretly recompressing. |
| Exact native adapter signature, credential destination, file-stat timing, progress callbacks, cancellation handle and server error mapping | Main implements transport. Page never sends credentials to a DTO-selected URL, builds a Storage path, or treats local extension/picker size as server proof. |
| Stable upload intent identity, payload binding, object-create versus row-binding phases, replay rules and read-only status semantics | Freeze one intent per selected file before any side effect. Same-intent reconciliation and explicit retry are possible without duplicate objects or attaching a different file. |
| Whether upload changes publication fields/version, stages an eligible path, or returns a binding receipt without editing the application | Prevent an automatic rebase of the editor. Define how new exact paths become accepted publication-confirm members before enabling save. |
| Minimal accepted upload/status receipt and checks for current caller, shop, activity, application, original file identity and bound path | Validate all supplied binding evidence; a generic HTTP 200, signed URL or plausible prefix is not upload/binding success. Do not invent unsupported receipt fields. |
| Signing bucket/prefix, path encoding, signature refresh and uploaded-but-not-yet-published image visibility | Retain the canonical bound path when signing fails. Do not request signatures for arbitrary client paths or broaden Stage1 signing. |
| Exact definitive no-write errors, unknown outcomes, missing-status semantics, expiry and replay permission changes | Use a separate upload classifier only after source verification. Never reuse the six Stage1 confirmation abort pairs as upload proof. |
| New-file count/batch constraints and removal/abandoned-object policy | A picker batch limit is not a total existing-image cap. Preserve all existing references; no implicit object deletion or background cleanup. |

If the frozen service cannot establish same-intent status/replay or cannot safely bind uploads to the current application, record that precise blocker rather than exposing a retry that creates new keys/paths. A candidate DTO, mock or audit job completion is not deployed-source verification. Do not implement a signed-upload URL, base64 upload, invocation, claim table or new authorization surface on speculation.

## Native UI And User Flow

1. Require both route UUIDs and a verified selected shop, then fresh management/upload capabilities and matching application detail. Preserve existing Stage1 privacy projection and masked applicant header. The current verified capability determines availability; preview overrides all write capabilities to false.
2. In the existing publication evidence grid, add the Figma upload tile labeled "添加原图" only when the frozen capability allows it. Where the approved state design calls for a disabled tile, label it accurately ("当前无上传权限" / "示例不可上传"); never show a fake active control. Existing answer/profile evidence stays a separate read-only section.
3. On an explicit tap, open image-only wx.chooseMedia with album/camera sources and original size requested. Initial UI processes one image per picker invocation, unless the frozen contract requires another shape; this is an interaction choice, not a business maximum. Users can add more independently. No chooser, authorization prompt or upload starts on page load, scroll, show or retry of an unrelated request.
4. Once safely consumed on the visible page, show the selected local original with its original filename when available (otherwise the local basename), size only when known, and "待上传 · 尚未保存到发布记录". Do not rewrite every extension to .jpg, create a thumbnail as the upload source, or silently convert/strip original bytes. Local original preview is wx.previewImage; local paths remain page-private except the minimum thumbnail source required by native view data.
5. Give an explicit per-file "上传原图" action. A picker selection alone is not authorization to auto-submit publication confirmation. Sequential upload singleflight keeps per-file state understandable; no background batch worker or speculative concurrency. Existing note/URL/references remain intact throughout.
6. Show a compact per-file progress bar only from actual adapter progress. If none is available, show an indeterminate "正在上传原图" instead of a fabricated percentage. 100% transferred means "正在核对上传回执", never success by itself.
7. After exact object/binding confirmation, add that server-confirmed eligible path once to the editor's draft references and label "原图已上传 · 发布记录待保存". A signature failure changes only preview availability: "原图已上传，暂不可预览"; it does not drop the path or offer a fresh upload as a signature repair.
8. Keep explicit Stage1 confirm/revoke modals and server-owned actor/time. No publication mutation occurs from selection, upload completion, removing a reference or leaving the page. Only matched confirmation receipt plus canonical six-field/version readback ends the editor as saved.

Only one picker/upload/status/mutation transition can own the relevant file at a time. Disable add/remove and confirm/revoke while a picker, active upload, unresolved upload, publication modal or pending publication intent would make the frozen path set ambiguous. Preserve all existing paths, including failed legacy signatures and more than nine members. New additions follow only the frozen new-upload constraints. Removal means removing a draft reference, not deleting the private object.

Note/URL edits are disabled during picker consumption and active upload/status requests so the captured edit generation is stable. After a confirmed upload, edits resume and increment normal draft generation. A local selection can be explicitly removed before dispatch with no API. Once a write is unknown, "remove" cannot erase its reconciliation record or imply remote cancellation. Do not let a new selection replace the bytes behind an existing upload intent.

## Per-File State Model

These are internal UI states, not invented backend status values. Separate the per-file upload ledger from the existing publication-confirm pending record.

| State | Display / Allowed transition |
| --- | --- |
| selected | Local preview, filename and known size; explicit upload or remove; no backend success claimed. |
| validating | Local metadata plus fresh authority checks; unsupported format/size is a recoverable local failure before dispatch; prior references/draft unchanged. |
| uploading | Actual transfer progress or spinner; no duplicate dispatch, no publication save, no replacing/removing this intent. |
| verifying | Bytes may have arrived; validate the server binding receipt and any required read-only confirmation. No success badge from transport completion. |
| ready | Exact bound path eligible for the current application draft; signature may be available or unavailable independently. Publication still requires its own confirmation. |
| failed-before-write | Definitively no server side effect under frozen proof; local file/draft retained, explicit retry revalidates authority. Backend-defined retry/new-intent rules govern keys, not UI guesses. |
| unknown | Timeout, malformed/mismatched receipt, uncertain cancellation or obsolete callback after dispatch; freeze original identity/payload. Only explicit read-only status, then permitted explicit same-intent retry. |
| checking | Read-only reconciliation singleflight; a missing receipt does not establish failure or authorize a replacement key/object. |
| conflict | Scope/relationship/permission/version conflict; no auto-bind, rebase or new write. Preserve authorized same-scope draft and offer deliberate reconciliation/latest-state choices. |

An upload that has physically succeeded but whose application binding is unknown remains unknown, not ready or safely retryable as a new object. The exact frozen multi-phase contract will determine which subphase can be resumed; do not flatten it into "upload failed".

## Picker And Page Lifecycle

Picker identity contains a unique picker instance token, captured userId, verified shopId, session revision/scope identity, activity UUID, application UUID and editor generation. It deliberately excludes the visible-request epoch. Upload/status callbacks still use the normal visible epoch plus their own immutable intent identity.

- choose -> hide -> callback -> show: hide clears private view data and disables authority, but keeps this picker token. Callback parks only the local result/error in private page state. It starts no upload, stat/validation request, signing call or business API and does not apply a hidden thumbnail. On show, complete fresh capabilities/detail first; then consume exactly once only if identity, token, editor generation, relationship and baseline remain acceptable.
- choose -> hide -> show -> callback: fresh reads may finish before the result. Keep the pending picker token, then apply the late result only if still visible and freshly authorized. Repeated show, duplicate callback or a second tap cannot consume/start it twice.
- Cancel returns to the prior draft with no file replacement, error alarm, path removal or write. A true picker failure is local and retryable, with prior content intact.
- User/shop/revision/activity/application changes or unload invalidate the picker and discard any parked local result. Same-user logout/login is a new revision; no old picker result may upload under the new session. Reload is not permission to recreate an old selected file intent.
- Returning from local/remote wx.previewImage also refreshes capabilities/detail without discarding notes, URLs, removals, ready additions or local selections. Failed refresh keeps write controls disabled. A new server version causes a visible conflict; it is not silently copied into expected_version.
- If hiding occurs after dispatch, prevent further file/phase starts. Abort an active transport only if main's adapter exposes a real abort handle; abort does not prove rollback. An already-started network request may still finish remotely. Its late result cannot paint/clear old page state; preserve its minimal intent for later explicit reconciliation. Do not claim the network is stopped if the adapter cannot stop it.

Fresh reads must not increment an otherwise unchanged editor generation merely because the native chooser hid the page. Explicit reload/discard, reentry to a different application, scope changes, draft edits and file replacement do invalidate the old picker/editor association. Keep this behavior local; do not weaken hidden guards in shared code or chat.

## Draft, CAS And Path Preservation

Maintain the accepted server baseline, the user's dirty publication draft, original references, newly confirmed eligible paths and unresolved per-file intents as distinct concepts. The view model contains only masked existing fields, safe file labels/progress and approved preview sources, not raw upload requests or all form answers.

The frozen protocol separates upload attestation from publication fields/version. Retain the original expected_version and union only the exact newly eligible bound path into the current draft, in user order with first-seen dedupe. Eligibility comes from the verified same-scope binding, not a guessed publish/<id>/ prefix. The original normalizeDraft allowlist is now extended only with these eligible paths; arbitrary new paths remain rejected.

A server version change during upload or fresh reads remains a concurrent-state conflict; no upload response changes the accepted baseline. Do not silently adopt a new version or discard prior dirty edits. Any future protocol that writes publication state during upload would require a separate source-reviewed transition design before implementation. New frozen publication requests still include activity_id and existing Stage1 exact receipt/readback rules.

Preview signing remains independent from path retention. A successful refresh can replace a signature only for the exact verified path and same application/category; it cannot introduce a different reference. Failed signing, path_not_allowed, legacy references, readback failure or expired URLs must not silently remove paths. Never open user publish URLs, sign arbitrary paths, fetch external originals or delete Storage objects as cleanup.

## Unknown Intent RAM And Explicit Recovery

Use a separate application-local App RAM namespace for dispatched upload intents, scoped by user + shop + activity + application + stable per-file intent identity. Do not reuse or overwrite the publication-confirm slot. No persistent storage, logs, analytics, base64 bytes, signed URLs, full answers or applicant PII. Retain only the frozen protocol identity/payload binding needed for reconciliation, monotonic everUnknown/retryBlocked markers and minimum local file descriptor needed for an authorized exact retry while the temp file still exists. Exact local wire fields are listed in the frozen adapter section above.

Before first side effect, write the minimal frozen intent. On hidden/unload/revision/403 revoke visibility and prevent new requests but retain unknown intent evidence. Reentry must verify the current same-shop caps and exact application relation before exposing pending metadata. Other accounts/shops/applications see nothing. Restoration is conservatively everUnknown and offers an explicit read-only check, never an upload. Loss of the local file cannot justify choosing another file under the same intent: allow status-only recovery and explain the retry limitation.

Unknown payload/UUID, local-file identity and application binding never change on retry. Read-only not-found is not proof of no object/transaction. Same-key retry requires a new explicit confirmation and fresh permission, and follows the exact frozen protocol; no automatic retry loop, reconnect retry, onShow retry, new random object path or automatic key replacement. Payload conflict blocks retry, not permission to rebuild the request.

First-never-unknown definitive abort release is allowed only if main supplies source-reviewed exact upload status/code pairs proving no ambiguous side effect across ALL relevant upload/binding phases. Stage1's whitelist is not portable. Historical unknown/restored intents cannot be released by later matching aborts. A verified success resolves only that file's upload intent; it does not clear pending publication confirmation or mark the editor saved. If the process terminates, RAM is lost: do not promise durable cross-restart recovery; surface any need for server-side outstanding-intent discovery in the contract review rather than adding disk storage.

## Preview And Error Honesty

Explicit preview is always read-only, even if synthetic capability accidentally says true. Do not invoke picker/upload/confirmation/status mutations in preview; main may provide explicitly synthetic local UI states for review, but unavailable remains unavailable and no real success is simulated as backend evidence. Production errors never fall back to sample paths or images.

Errors are per file where possible; one file's failure cannot clear ready existing references, note/URL draft or another file's status. Permission failures hide sensitive data and require reauthorization. Current 401 uses the existing shared flow; stale callbacks, including old401, never sign out a new identity. Copy concise reason text without server SQL, raw storage error bodies or credentials.

## Contract-Gated TDD Work Packages

Main has now frozen the local contract and granted scoped page/test ownership. Executable lifecycle/binding/recovery cases below are covered through tests/application-upload-pages.test.cjs while retaining all 39 prior application tests. Upload-specific definitive abort release remains gated on source evidence rather than copying Stage1 rules. Shared tests and reference modules were not edited. Deployed backend schemas remain normalized exclusively by main.

| Package / Proposed owned files | RED cases and required GREEN evidence |
| --- | --- |
| 1. Authority and schema gate: application/index.js, model.js; application-pages tests | Both UUIDs + verified shop required before any API. Caps false/malformed/wrong shop, wrong relationship, suspended scope, preview and existing pending publication each yield zero picker/upload writes. Actual frozen DTO fields are strictly checked; no guessed roles. |
| 2. Native selection: index.js, index.wxml; tests | Explicit tap requests image/original with album/camera. Preserve .png/.heic/etc filename, reject missing temp path, cancel leaves prior draft unchanged. Multi-tap is singleflight; no upload occurs from choosing alone. Local preview is native only. |
| 3. Picker lifecycle: index.js; tests with deferred callbacks | choose-hide-result-show and choose-hide-show-result each apply once after fresh caps/detail. Hidden callback makes zero business/upload/stat/sign requests. Duplicate callback/show cannot duplicate work. Parameterize user/shop/revision/activity/application/editor change and unload before/after callback: no stale apply/upload. |
| 4. Validation and progress: index.js, model.js, index.wxml/index.wxss; tests | Frozen format/byte boundaries and true file metadata, forged extension/size, failed stat and scope change during stat. Show only adapter progress, no fake percentage; transfer complete without binding receipt remains unsaved. Sequential per-file and handler/UI guards agree. |
| 5. Exact original upload receipt: index.js, model.js; tests | Exact confirmed file/application binding makes only that file ready. Wrong shop/user/activity/application/file/path, malformed receipt, untrusted URL or partial-phase response stays unknown. File request retains original source and immutable protocol identity. Signing failure retains confirmed path without reupload. |
| 6. Draft/CAS integration: index.js, model.js; tests | Note/URL/removal survive selection, preview, failed upload and fresh signatures. Existing >9 refs remain. New-intent dedupe preserves order; historical publication RAM duplicates and payload are untouched. Concurrent version change disables confirm and cannot silently rebase; frozen contract defines any upload-caused version transition before its RED test. |
| 7. Unknown RAM: index.js/model.js if needed; same-App cross-page tests | Timeout, hide/unload/403 after dispatch preserve minimal per-file intent. Fresh same-scope caps/detail precede restoration; zero auto-mutation. Explicit status not-found retains intent; retry repeats same file identity/key/payload only after confirmation. Missing local file is status-only. Conflict blocks retry. One file cannot overwrite publication RAM or another file. |
| 8. Definitive/unknown distinction: model.js/index.js; tests | Enable only separately audited upload abort pairs. First proved no-write error retains draft and invalidates old authority before new intent. Same error after timeout or RAM restore never releases. Status not-found, 401/403, transport, server internal error, mismatched receipt and unknown phase never release. |
| 9. Save, privacy and read-only preview: all owned application UI/model; tests | Explicit publish modal freezes only ready eligible paths; unresolved files block submit. Exact publication receipt + six-field/version readback required; upload alone never saved. Raw answers/PII/tokens/upload payloads absent from view data. Preview has zero picker/upload/write calls despite malicious synthetic caps. No H5/direct Storage or object-delete code. |

Focused command: `node --test tests/application-pages.test.cjs tests/application-upload-pages.test.cjs`. Full command from the mini-program root: `node --test tests/*.test.cjs`. Run `node tools/check.cjs` and the installed official wcc/wcsc against all native templates/styles; keep WXML expressions native-compatible, with raw && and no inline objects/method expressions. Record actual fresh counts, not planned increments.

Main's Figma state read/approval precedes implementation styling. Main captures real DevTools evidence after a declared stop-writing window: ready tile, picker return, per-file progress, validation failure, unknown/status, signature unavailable, version conflict and preserved dirty draft, all at 390x844 without cropped controls. Device selection/permission behavior, true original-byte preservation and authorized employee upload/binding/save acceptance remain separate from VM tests, synthetic preview and compiler success.

## Handoff And Stop Condition

- [x] Read Stage1/Stage2 design, actual native picker lifecycle and its regression cases.
- [x] Document UI states, lifecycle isolation, unknown replay constraints, draft/CAS preservation and no existing-total cap.
- [x] Enumerate source/contract freeze requirements without inventing API/DTO/format/size/idempotence rules.
- [x] Main freezes ACTIVITY_UPLOAD_PROTOCOL.md and the five normalized adapter signatures/active options. Existing Figma 6:3 and this state spec are authorized references, not newly created frames.
- [x] Main authorizes scoped production/test implementation; execute RED -> GREEN packages and preserve Stage1 regressions.
- [x] Run focused/full/static/official compiler and freeze owned files.
- [ ] Main source/deployment normalization review and actual GUI screenshots, followed by separately authorized original-byte/device/employee acceptance.

## TDD And Freeze Evidence

- Initial RED: all 15 new upload tests failed before implementation because the native uploader/control surface was absent.
- Added RED -> GREEN: pre-write inspection hidden/return recovery; strict nullable status DTO; live-upload refresh/old-evidence-preview isolation; preservation of original selected filename; invalid RAM restoration remaining fail-closed across repeated reads. Other tests verify per-phase isActive guards, late identity401 isolation, same-intent retries, 403 recovery, nine pending versus >9 existing references, and exact publication payload restoration.
- Independent-review P2 RED: 29 upload tests, 26 passed / 3 failed. A selected unsent image plus a refreshed server-version conflict trapped the editor; local omission incorrectly depended on the upload-write guard. Local omission now has its own visible/current-identity/fresh-management guard and still blocks read/modal/write/upload flights and publication pending/confirmed state. It permits conflict-time omission only for unsent, ready or currently blocked-terminal records; unknown cannot be erased even if an older terminal flag remains. Removal makes zero remote calls and preserves dispatched RAM. Explicit latest reload still requires its modal, with cancel retaining the dirty draft.
- Final focused: 68/68 passed (39 existing application + 29 upload). Fresh complete native suite: 550/550 passed, no skips/cancellations. Main's concurrent shared tests are included in that observed full count, not attributed to this worker.
- Static checker passed 19 native routes. Installed official wcc compiled all 20 WXML and wcsc all 21 WXSS with zero failures.
- The existing static application test was retained, expanded to inspect the new local modules and updated to allow the now-authorized native picker while continuing to prohibit disk storage, direct RPC/transport, H5 and approval/coupon side effects.
- All remote upload errors conservatively retain their dispatched intent; no source-verified upload-specific definitive-abort whitelist was supplied or invented. Stage1 confirmation's audited whitelist remains separate. RAM is process-local only.

Owned application files/tests/document are now frozen for main compiler and GUI checks. No shared/backend/Git/business-record changes, actual uploads, real employee mutations, deployed-source verification or employee-E2E claim by this worker.
