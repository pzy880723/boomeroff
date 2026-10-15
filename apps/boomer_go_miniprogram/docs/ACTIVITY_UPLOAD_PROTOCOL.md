# Activity Evidence Upload Implementation Plan

**Goal:** Complete native original-image upload in the existing employee application editor, with explicit publication association, exact file/request binding and no H5 or expanded employee authority.

**Architecture:** Caller-JWT direct Storage upload to a server-issued, application-bound marker path; caller-JWT reads measure the actual bytes; one service-only attestation RPC records that trusted observation. Restrictive policies protect only the new namespace. Existing publication CAS and private receipts remain authoritative. This is a protocol/design freeze, not a deployed feature claim.

**Stack:** Existing native WXML/WXSS/CommonJS, wx.chooseMedia/original files, wx.uploadFile, existing GO Lovable Cloud and PostgreSQL. No new runtime npm dependency or separate database.

## Decisions And Alternatives

The existing editable Figma editor 6:3 already includes the upload tile. Preserve its red/white system, >=44px actions and separate applicant answers. Add per-file selected/uploading/checking/ready/unknown states as specified in ACTIVITY_UPLOAD_NATIVE_PLAN.md. Two attempts to create supplementary Figma state frames returned a tool-side truncated-argument error; metadata confirmed no new frames. Do not claim these frames exist. The existing editable design plus this state specification is the implementation reference; actual native screenshots remain required.

Choose caller-JWT direct upload rather than signed-upload URLs: the new restrictive INSERT gate can check current authority at the actual upload, and no two-hour bearer upload token is created. The old bucket's unrelated legacy permissions remain unchanged. Proxying full originals through the BFF would add avoidable transfer/memory overhead. Neither direct upload nor a platform upload response alone proves the file passed byte validation or was associated with the application.

Only the service-only attestation write may use the existing server service-role credential. It is not used for Storage reads, signing, arbitrary table access or client transport. All other actions and final publication use the employee JWT. A private explicit-actor gate must independently reproduce current disabled/fresh/scope/manage semantics inside attestation; a stale open-window grant is insufficient, and JWT claims must not be impersonated. If source equivalence cannot be established, stop that implementation rather than silently weaken it.

## Frozen Native Interface

Every action requires verified current user, fresh ERP scope, non-NULL authorized shop, voucher.manage and exact application -> activity -> voucher.shop relation. Every request/replay/status binds shop_id/activity_id/application_id. Unknown/foreign resource is uniformly not_found; no raw applicant records or credentials enter view data.

Capabilities adds can_upload_evidence:true and upload_policy with max_bytes:10485760, max_pending:9, intent_ttl_seconds:600 and formats:[jpg,png,webp,gif,heic,heif,avif]. These are NEW upload limits, not a cap on existing references. One picker image at a time is a UI choice, not a business total. Server magic detection is a format-header check, not a full decoder or malware scan.

1. publication-upload-intent parameters:

```json
{"shop_id":"uuid","activity_id":"uuid","application_id":"uuid","request_id":"uuid","format":"jpg","byte_size":1234,"digest_sha1":"40 lower hex"}
```

Returns these binding fields plus actor_id, intent_id, path, expires_at and replay. No upload URL/token is returned. The server generates exactly `publish/<application_id>/go-native-evidence-<intent_id>.<format>` in existing private voucher-screenshots. Same actor/request/payload returns the same intent/path without extending expiry; different payload conflicts. Client SHA1 is only a local-byte identity check, never trusted proof of format or content. Local declared format comes from header bytes, not the filename suffix.

2. publication-upload-status parameters are shop/activity/application/request_id, with optional known intent_id as an additional consistency check. This works even when the create response was lost. Return common scope/request binding and state:not_found|pending|uploaded_unverified|verified|consumed|expired|object_changed. Known intents also return their exact metadata. Verified/consumed include the original attestation receipt; its preview may be unavailable independently. Status never uploads, attests, consumes, deletes or associates. not_found never proves a previous network side effect failed.

3. publication-upload-commit parameters are the same scope/request fields plus required intent_id. Edge opens a short-lived commit observation under caller JWT, reads only the exact stored bucket/path under that JWT, enforces bounded actual byte length, detects format and computes full-byte SHA256/SHA1. The service-only attestation RPC takes only Edge-produced observations, validates its nonce/object/intent plus CURRENT explicit-actor authority and relation, and commits the receipt atomically. No authenticated RPC can mark a client-supplied hash as trusted verified.

The minimal verified receipt binds actor_id/shop_id/activity_id/application_id/request_id/intent_id/path/format/byte_size/digest_sha1, object_id/object_version, sha256, expires_at and replay. Client checks all relevant fields against its frozen intent. Original-byte length/digest/format must match the declaration. A repeated commit can return the original verified observation only when the current object remains the same version. No overwrite or fresh key as recovery from an unknown upload.

Preview is a separate `{path,signed_url,error}` value. Only a verified same-intent path or currently associated same-application path can be signed using caller JWT. Signing failure cannot remove the path or turn a completed upload into a new upload attempt.

4. publication-confirm keeps its existing screenshot path array and adds optional new_evidence_intents UUID[] (default empty). Every non-existing path must correspond exactly to an included, current caller's verified, unconsumed, unexpired intent. Extra unused intent IDs are rejected, not silently consumed. Original existing members retain their prior preserve/reorder/remove rules, including more than nine members and legacy signature failures.

For no new IDs, preserve v2 canonical payload hashing/replay compatibility. With new IDs, bind ordered deduplicated IDs in a v3 canonical hash. Current authority/relation and original operation receipt are checked before CAS/consumption; exact accepted replay must not fail because its own intents are now consumed. New association, consumption, six-field CAS update and publication receipt commit together. No review, claim, SMS, social publishing or automatic deletion occurs.

The detail/signing path distinguishes new marker files from legacy images. A new marker must have a valid bound attestation and matching current object version; unknown/changed marker paths remain in the DTO but cannot receive a signature. Same-store other authorized managers can read an image after it is actually associated, not another actor's unassociated upload.

## Storage And Trust Boundary

- Keep all existing permissive bucket policies and legacy paths unchanged. Add RESTRICTIVE authenticated policies ONLY for voucher-screenshots/new marker namespace; unrelated bucket/path predicates return true.
- INSERT requires the exact current caller's live server-issued intent, current application relation and fresh/manage scope. Do not trust self-reported object owner fields as authority.
- UPDATE USING and WITH CHECK both reject marker paths, including unknown/no-intent paths. DELETE rejects the entire marker namespace. This blocks overwrite and moving into/out of the marker path under employee JWTs.
- SELECT permits an unexpired own unassociated intent under current fresh authority, or an exact currently associated member under fresh same-store manage. Storage derives the shop from the binding, not a client current-shop claim. Final BFF reads additionally enforce explicit selected shop.
- Platform/database owner and service-role capabilities remain a trusted infrastructure boundary, not an immutability guarantee against administrators of the platform itself. No production object upload or deletion is part of synthetic verification.
- Preserve content and original format; canonical `.jpg` versus `.jpeg` naming is permitted for identical JPEG bytes. No silent compression or conversion. Unsupported originals get an explicit error.

## Client State And Recovery

Main owns shared evidence file inspection/upload transport, shared API guards/preview and integration. Application worker owns page/model/WXML/WXSS/tests. Upload RAM is distinct from publication pending RAM, keyed by user/shop/activity/application and one immutable local upload request. Do not retain applicant answers, signed URLs, credentials or raw bytes in global RAM or disk.

Picker tokens survive native hide/result/show ordering, but no upload starts hidden. A callback can only park its result; visible return requires fresh authority and unchanged identity/editor generation. Unload/re-login/scope change discards a picker result. A started remote request may finish despite local cancellation; do not infer rollback from abort.

Explicit upload first inspects current local bytes/size/SHA1, freezes the intent request, then creates/reconciles the same request ID, uploads with `x-upsert:false` only to the returned fixed path, and explicitly commits. Progress comes from UploadTask callbacks; transferred 100% means verifying, not ready. On timeout or mismatched receipts retain the original request/key/file fingerprint for explicit status and same-intent recovery. Recheck local byte identity before any retry; a changed local file cannot silently reuse the intent. An existing remote object is reconciled/committed, never overwritten.

Only exact verified receipts add eligible paths to the current dirty draft; publication saving remains a separate explicit modal. New paths do not silently replace expected_version. Removing a selected local file before dispatch has no remote effect; removing a ready reference does not delete Storage. Unknown remote intents cannot be erased as if cancelled. Expired/changed evidence blocks association and offers explicit recovery, not fabricated success.

## Execution And Verification

- [x] Read existing editor/upload paths, permissions and official Storage docs; compare three transport options and review trust weaknesses independently.
- [x] Freeze this protocol and the application worker's native state/TDD plan before production changes.
- [ ] Coordinate exact backend implementation, migration names, error/status mappings and explicit-actor equivalence; independently read the fixed source before treating the contract as deployed.
- [x] TDD shared original-file fingerprint/header detection and fixed-destination upload, including stale identities, changed local bytes, malformed binding receipts, progress and unknown outcomes. Eighteen focused mock tests pass; independent review closed the explicit user/shop and immediate pre-I/O lifecycle guards. This is not a live Storage upload test.
- [x] TDD native picker hide/result/show, no hidden writes, per-file unknown recovery, draft/reference preservation, server expiry states and exact publication intent IDs. Sixty-eight application tests pass, including the independently found selected-file/CAS-conflict omission regression. These use simulated adapters, not production uploads.
- [x] Update activity capability parsing without granting upload rights locally; preview remains explicit and never uploads or saves. The activity list accepts a strict boolean true/false rather than breaking when the backend adds upload capability; upload writes still require the application editor's separate gate.
- [ ] Re-run all prior 502 tests, new focused tests, static route checks and official WXML/WXSS compilers; inspect actual native states and return navigation.
- [ ] Source-review narrow service attestation, current actor authorization, restrictive-policy AND semantics, legacy isolation and atomic publication consumption. SQL synthetic rows must roll back; no production objects or real business records.
- [ ] Push only the mini-program directory through the isolated Git index and verify remote SHA. Record real-device, AppID, Storage-service behavior and old Web compatibility acceptance separately.

Reference docs inspected: Supabase createSignedUploadUrl and uploadToSignedUrl (official docs), current changelog (TLS 1.2 CBC retirement on 2026-11-10), and installed official WeChat API declarations. Browser docs retrieval for WeChat failed; local vendor types expose wx.getFileInfo SHA1 but FileSystemManager.getFileInfo only size. Actual API use and hardware support require focused verification; no polyfill should invent a file digest.
