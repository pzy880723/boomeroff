# Native Manual Copy Asset Plan

> Workers: use executing-plans and test-driven-development. Preserve unrelated edits and the normal Git index.

**Goal:** Migrate existing manual copy creation/edit/removal inside the native material library without restoring a separate AI-copy menu or calling a model.

**Architecture:** One secondary native editor. Narrow caller-JWT PostgREST requests use the existing marketing_assets table/RLS; only current selected authorized shop, current user, kind=copy, meta.source=manual_upload. No admin exception is inferred. Client-selected UUID freezes a create identity, not a server request receipt. Update changes output_text only, preserving candidate unknown fields and every unedited candidate; base output_text is an exact conditional filter. Explicit deletion has separate confirmation and representation+readback checks.

**Tech Stack:** Native WXML/WXSS/JS, existing session freshness, fixed REST adapter and node:test.

## Evidence And Boundaries

- [x] Previous turn pushed native history/growth and verified1734 tests; progress, not completion.
- [x] R36 polled again: awaiting_input,a4d6edb0,20.3credits. Do not approve, restart or bypass.
- [x] Fixed GO a4d6edb0 UploadAssetDialog inserts manual copy into marketing_assets; title max60/body max1000. Copy may be plain output_text with meta.candidates or a JSON candidate array after Web editing. Existing AssetDetailDialog updates output_text only. Table permits client id; no updated_at/version or immutable request receipt exists.
- [x] Existing RLS marketing assets owner-in-store applies to insert/update/delete; caller read is store-visible. Native editor intentionally restricts management to caller-owned manual copy in the verified selected store, not generated copy or other employees. This is a subset, not full administrator asset management.
- [x] Fixed schema references social_publish_jobs.asset_id ON DELETE SET NULL. Do not delete publishing jobs, Storage or remote platform posts. Photos may automatically queue paid tags, so this flow is text only, no hidden model call.
- [x] Figma32:2 rendered and visually inspected, existing approved red/white native direction under overnight delegation. No new Tab.

## Frozen Interfaces And Ownership

Worker A owns new shared/manual-copy.js, shared/manual-copy-api.js, minimal api.js/transport.js wiring, and tests/manual-copy-api.test.cjs. Parent owns route/entry/preview/integration/docs. Worker B owns pages/manual-copy/index quartet and tests/manual-copy-page.test.cjs only.

`manualCopy.read(api,id)` is not a generic DB API. Frozen public API:

- `api.manualCopyRead(id)` -> owned, same-shop manual raw row `{id,user_id,shop_id,kind,output_text,meta,created_at}` or null when not visible. Keep raw metadata private, never install it wholesale in page data.
- `api.manualCopyWrite(intent)` -> `{operation,id,row?,deleted?:true}` only after exact representation validation; errors never auto-retry. It performs one mutation only; page separately reads exact ID before showing completion.
- Helper exports `createIntent(context,draft)`, `updateIntent(context,base,index,draft)`, `deleteIntent(context,base)`, `candidates(row)`, `matches(intent,row)`, `key(context,id)`. Context includes `{userId,shopId}`; intent freezes operation/id/userId/shopId/baseOutputText/outputText (and create metadata). Names/types must not drift between workers: coordinate first, report any ambiguity before edits.
- Parse JSON candidates or plain text; preserve unknown keys, all other candidates and untouched hashtags. Candidate selector allows choosing an existing candidate. Empty body or title>60/body>1000 fails without truncation. No arbitrary recursive metadata search.

## Task A: Existing Caller API

- [x] RED transport/API tests: fixed origin/table/fields/methods, required user token, exact actor/shop/manual kind/source/class filters, current fresh before/after, frozen create UUID/no upsert, conditional output_text update, explicit row DELETE representation, bad/empty/wrong responses, stale identity/revision and no automatic retry. API57 GREEN after correcting scalar eq quoting against official parser source.
- [x] Implement only fixed reads/create/update/delete for this manual-copy scope. Ordinary read-only transport/action behavior unchanged; no new SQL, grant, secret or Lovable task.
- [x] Validate mutation representation and return only frozen match; update/delete zero rows is conflict/unconfirmed, not success. Fresh scope loss or timeout is unknown. A visible matching create/update row proves current outcome, not exactly-once request attribution. Delete read absence without a verified deletion representation is not confirmed deletion.

## Task B: Native Editor

- [x] RED actual shared-page-shell tests, then title/body/candidate selector, local drafts, dirty state, separate confirm save/delete, exact ID independent readback, pending/receipt/unknown/conflict states. Page40 GREEN.
- [x] Single flight and lifecycle/identity/revision/old-modal protection; unknown requests immutable in small same-actor/shop App RAM using existing receipt patterns, not disk. Reentering must not issue a new create ID while the original unresolved intent is retained. Hide retains drafts but clears private UI; unload clears page UI, original unresolved App RAM intent remains scoped. Process restart is not persistent recovery or exactly-once.
- [x] Reconcile is read-only. Known create/update outcome requires matches(intent,row). Delete requires verified representation plus absent readback; absent unknown deletion remains unconfirmed. No automatic resend. No new paid generation, publish or broad account operation.
- [x] Explicitly discard unsaved drafts before loading newest; do not silently overwrite draft on foreground/refresh. Preview edits drafts but save/delete/reconcile network disabled.

## Task C: Integration And Acceptance

- [x] Add27th native route, create button inside library, owned manual-copy edit entry in asset detail; no separate AI-copy menu. Parent updates title rendering only if old plain/manual metadata needs it, with regression first. Hidden-late401 guarded with real API/shared-shell control; removed copies clear stale content on return.
- [x] Add explicit synthetic preview contracts, actual GUI Chinese title/body input, return confirmation, second-candidate selection and disabled save/delete. Independent two-P2 fixes,1846 tests,27routes and official28WXML/29WXSS through fresh runs.
- [x] Update parity/verification and the stale INITIAL_REVIEW; sourcea2742b23 exact24-path alternate-index commit/push/readback and immutable archive clean-extraction checks passed1846/27routes/28WXML/29WXSS. Full migration/AppID/employee/backend gates stay open; this checklist completes only the manual-copy subset.
