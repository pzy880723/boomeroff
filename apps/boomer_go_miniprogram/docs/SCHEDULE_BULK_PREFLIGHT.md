# Schedule Bulk Preflight

2026-10-16. Read-only follow-up to Stage1, not implemented bulk endpoints or authorization to execute real swaps/clears. The complete schedule target remains in SCHEDULE_MANAGEMENT_DESIGN.md.

## Actual Web Semantics

Fixed R30 source021a5adbe3e0146cffcae69de5a38e49fcc3949b matches813c128 for ScheduleManager/ShiftSettingsPanel/Portal. Portal244 uses schedule.write. Clear197-201 removes every selected-shop row Monday-Sunday, not only current candidates or manual rows. Swap226-258 exchanges only user_id between two different employees' existing slots, on the same or different days; IDs/dates/shift/source/note/creator/timestamps remain attached to the slots. It uses three unsafe writes and a zero UUID; the native migration must not reproduce that implementation.

schedule.clear and schedule.ai are registered keys, but Web swap/clear and R30 capabilities actually use schedule.write. Adding a new schedule.swap key or silently requiring schedule.clear would change authority. The proposed native operations retain current view plus schedule.write/fresh/selected-authorized-shop/non-suspended/non-write-blocked gates. Stage1 implemented_operations remains exactly create/update/delete; any bulk capability is additive and separate.

## R31 Owner Metadata Report

Read-only Lovable handle umsg_01m51993nkfjraqdzxwvpw8nhq completed with no source edit/migration/deploy or employee-row query. FixedSHA remains021a5adbe3e0146cffcae69de5a38e49fcc3949b. Main read the source and independent auditor agrees with Web semantics, but the live catalog findings below are the backend owner's report, not independently queried catalog results.

- Columns: id/work_date/shift_code/user_id/source/note/created_by/shop_id/created_at; no generated/identity columns. Primary id, non-deferrable UNIQUE(work_date,user_id), nullable shop FK to shops with cascade.
- Reported no incoming FKs, user triggers, rules or publications. This reduces but does not prove absence of external consumers/physical-row side effects.
- Existing source uses plain inserts, not known ON CONFLICT on this table; absence in scanned source cannot establish all external clients. Do not change unique deferrability merely for implementation convenience.
- Reported anon/authenticated have TRUNCATE as well as ordinary CRUD privileges. TRUNCATE bypasses RLS, but no exploit or business operation was attempted. Exact sanitized catalog proof and a narrowly scoped security follow-up are still needed; no privilege was changed in R31.

## Proposed Atomic Contract To Review

Separate bulk-capabilities, swap-preview, clear-preview, write and status. Previews use callerJWT/RLS and the R30 public eligibility projection; hidden private eligibility must not affect candidate/can_swap/reason/version outputs. Only mutation rechecks private eligibility. Swaps check both original rows plus up to4 user/date cells, current eligible shifts and current visible per-target warnings. No fake identity/date, third-cell overwrite, cross-shop move, five-day cap or invented publish/notification phase.

Same-date UNIQUE makes a naive CASE UPDATE fail. Catalog-supported transaction-local delete/update/reinsert preserving every slot field is one owner proposal; a deferrable constraint is another with global compatibility risks. No strategy is frozen or implemented yet. Confirm live dependencies and transaction rollback before choosing; do not claim DELETE+INSERT is universally side-effect-free. Any chosen replacement must preserve all9 original fields except the swapped user_id, verify each affected-row count and roll back every step if update/reinsert/receipt fails; defaults cannot reconstruct slot metadata.

Clear binds exact selected shop/week/set-version/count, including former/ineligible employees' existing rows. The locked current IDs, row versions and count must equal the confirmed target set, including any currently present added/moved/changed row. This proves current-set equality, not that no intervening change ever happened: a plain hash cannot detect fully restored ABA history. Do not expand the deletion set after confirmation. Require the complete authorized-shop SELECT branch rather than own-row-only visibility, and never disclose another shop's rows or reference counts.

Request locking, deterministic R29-compatible cell/row locks, rule phantom protection, old direct DML and post-wait wall-fresh gates must be handled together. A short table write lock can exclude legacy phantoms, but its order with R29's cell/row locks needs independent review; use bounded waits/try-lock or NOWAIT with full rollback rather than asserting a deadlock cannot happen. No actual two-session concurrency proof exists yet.

Receipts/status bind original actor/request/operation/shop/week/targets/expected versions/payload hash. Exact order is current actor/store/read/write/wall-fresh gates, then original receipt binding/replay, then new-target existence/private eligibility/rules/CAS. Status does not depend on targets existing. Unknown does not auto-resend or replace the key; not_found is not cancellation proof. Restored recovery cannot depend on deleted targets still being readable, per the Stage1 fixed404 finding. A committed receipt and proof that the current rows still match are separate states.

R27 home authority, shift settings, blocked days, holiday maintenance and AI schedule remain separate open work, not removed by this preflight. No bulk UI/API should call guessed action names.
