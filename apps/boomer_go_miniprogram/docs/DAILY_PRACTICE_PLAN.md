# Native Daily Practice Implementation Plan

**Goal:** Migrate the employee Web's own-library continuous practice into native pages without client grading, shared-account progress leakage or a fictional server daily quota.

**Architecture:** One native practice overview reads the same latest-300 favorite window as Web, selects the oldest five unmastered items, then removes today's locally attempted items. A small app-owned practice coordinator freezes the current queue in RAM. Existing native reading and quiz pages remain the actual content and server-graded test surfaces. Only a validated, saved server quiz result marks a real attempt complete.

**Stack:** Existing WXML/WXSS/CommonJS, native storage/navigation, existing caller-JWT GO backend. No H5, dependency, new business permission or service-role business read.

## Source And Design Decision

Read `src/pages/MyLibrary.tsx` at fixed GO ref `42984c7ae027a2086ecd93fc05bfdcf35122d1fa`: lines125-135 read latest300 favorites and own test results;226-235 choose oldest five pending then remove locally attempted keys;390-429 count both passed and failed attempts;432-449 exit/next operate a frozen in-memory queue. Old localStorage uses an unscoped key and browser-local date; do not copy that identity leakage or client result upsert.

Three options: reuse only the currently loaded20 rows would silently change recommendation scope; fetch six offset pages would create extra mobile latency and a shifting window; add a narrow read-only `practice-library` action for the existing latest300 scope. Choose the third. It does not broaden table access and must fail the whole read if result lookup fails, never treating a failed lookup as unmastered.

User delegated overnight initial-version design and migration. Retain the approved red/white employee card style, typography, gutters and44px controls. Add a small learning-page card with one primary action, not another Tab. The native overview shows latest300 scope, local today's attempted count, current queue and explicit Start/Continue/Exit controls. Reading displays a discrete continuous-practice note; quiz adds a next-item/return action only for a valid active queue. Do not auto-submit, auto-skip failures or auto-start paid operations. Actual editable Figma augmentation previously failed tool-side; this written interaction spec plus native implementation/screenshots is the fallback, not a claim of a new Figma frame.

## Frozen Interfaces

Backend `practice-library {}` returns `{items,window_limit:300,has_older:boolean,as_of}`. Items have the current my-library projection: own favorite id/source_type/source_id/snapshot/created_at plus quiz_kind=favorite, quiz_available and strict passed boolean. Query only caller-owned latest301, stable created_at/id descending, return first300. Join saved pass facts only for these IDs, bounded batches if necessary; no answer keys, contact data, arbitrary-user filter, source-role fallback or new grants. Existing auth/fresh ERP gates remain unchanged. This read is not a transaction snapshot or server daily-task ledger.

Main owns `miniprogram/shared/daily-practice.js`, app integration, shared/preview fixtures and helper tests. Page worker owns new `pages/practice/index.*`, learning entry, narrow reading/quiz integration and page tests. Main registers the route and checks the full app. No unrelated page or normal Git index changes.

`createDailyPractice({wx,session,preview:false,now:Date.now})` exposes:
- `stamp()` returns a nonsecret frozen user/shop/scope-version/revision/Shanghai-date guard. `setLibrary(dto,stamp)` installs the read only after this guard and page visibility still match. It rejects malformed owner/item/window proof before exposing a queue. The helper performs no network I/O.
- `view()` returns date, attemptedCount, queue, index, current, progressError and preview flag, with no tokens or answers. The interface labels progress as local-only. Actual source/title values remain in RAM only.
- `start()` freezes current recommendations (oldest five strict passed:false, then removes attempted IDs). It does not replenish while active, start a quiz or read an inaccessible source.
- `matches(id)` checks the guard and exact uncompleted/unskipped current favorite id; native reading/quiz query `practice=1` is only a route marker, not authority.
- `recordAttempt(id,receipt,stamp)` accepts only exact favorite binding, saved strict true, valid integer server count/passed/submitted proof from the existing quiz validation. It records only favorite IDs for that user/shop/day, regardless of pass, never alters source mastery. Valid ordinary single-favorite tests also count, matching Web. Preview requires explicit persisted:false and records separate RAM-only synthetic practice, never real progress.
- `next(id)` advances only a confirmed current item. `skip(id)` is a separate explicit, confirmed UI action; it advances without counting an attempt or mastery. `exit()` clears the queue, not today's attempted IDs. `clear()` safely clears all RAM on authentication transition without deleting saved own progress. Identity/revision/shop/date change invalidates RAM before any view or operation; a new actor cannot install an old result.

The page owns reads; the helper owns selection/continuity/storage only. Persistent storage contains version/date/own favorite IDs under a user/shop-scoped key, never passwords, tokens, questions, answers, grades, names, snapshots or photos. Storage failure is visible and retains RAM progress; it cannot be called durable success. Shanghai midnight rechecks on show and before writes. This is device-local practice progress, not cross-device quota or server assessment.

Use bounded native redirects: learning navigates to overview; overview redirects to reading; continuous reading redirects to quiz; result explicitly redirects to next reading or overview. This avoids a growing reading/quiz stack across five items. Exiting via native back keeps confirmed progress; it does not claim to recover a half-finished question. Unknown submission retains the existing private token/answers in the current quiz page for explicit same-answer retry. Source-unavailable items may be explicitly skipped, never silently counted complete.

## Tasks And Checks

- [x] Coordinate the read-only backend action and inspect final fixed source. R19 added practice-library; R20 repaired its deep-object projection; R21 repaired the same legacy knowledge projection. Main read final ref a8e36ee6a14b3577b68764b0b7452f6623d15e4d and independently hashed index/practice/test. Lovable reports deployment and Deno73. Existing my-library behavior and authority are unchanged; real employee calls remain unverified.
- [x] Helper nineteen tests were observed RED to GREEN, covering window/order, owner/scope/date, receipt, storage failure, ordinary single-favorite practice and RAM-only preview. App/route and preview changes also had RED-to-GREEN regressions.
- [x] Page worker observed25 RED and2 existing GREEN, then33 focused passing. Independent review found the midnight unknown-retry P2; three added regressions were RED to GREEN. First send still needs current queue, while a frozen uncertain answer can retry under the same identity/revision without advancing a new day.
- [x] Extend explicit development preview with exact latest300 metadata and three synthetic favorites (two pending), separate result/source IDs and RAM-only practice. Never update real grades or sample mastery from a synthetic submit.
- [x] Main and independent review; main freshly ran686 tests and official compilers, then actual two-item synthetic GUI. Independent178 tests passed after closing midnight recovery; R20 actual-source mock10 and R21 forty-five handler combinations/four boundaries confirmed deep stripping closed. No new confirmed P1/P2; real employee/device acceptance remains separate.
- [ ] Push only native Mini changes through the isolated index, verify remote SHA, archive the source and record real AppID/employee/device gaps honestly.

Registration, new permissions, server quotas, cross-device progress, admin grading and batch answer submission are not substitutes for this existing continuous-learning workflow and are not introduced here. The overall migration goal remains unchanged; this plan is one missing workflow, not a redefinition of completion.

Main freshly ran686/686,20 route checks and official21WXML/22WXSS compilers. Actual DevTools synthetic flow: overview -> first reading -> quiz -> explicitly unsaved result -> second reading -> overview -> confirmed skip -> exit. The counter remained one after skipping and exiting; another round stayed available. The full five-item stack bound is source/unit-tested, while GUI used two items. No real employee, storage-progress persistence, phone hardware or public Mini release is implied.
