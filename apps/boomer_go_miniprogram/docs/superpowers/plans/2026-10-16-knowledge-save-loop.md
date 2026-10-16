# Knowledge Save Loop Implementation Plan

> For agentic workers: use executing-plans and test-driven-development to implement the bounded tasks below.

**Goal:** Save an existing recognized product to the employee's personal knowledge library with verified receipt and explicit native reading navigation, never automatically start a quiz.

**Architecture:** Keep the existing detail route and cloud-actions styling. Isolate knowledge-save from generic writeAction. Use the existing BFF `{saved: true, favorite_id: UUID}` receipt and read `knowledge-detail(kind=favorite,id)` to match favorite ID, recognition source type and original product. This is not an exactly-once or persistent receipt backend.

**Tech Stack:** Native WeChat JS/WXML/WXSS, existing page/session/API shell, node:test.

## Design And Evidence

- [x] Read fixed GO Web source `src/components/dashboard/LiveStreamPanel.tsx` at a4d6edb0: manual favorite with no automatic quiz or navigation.
- [x] Read existing BFF knowledge-save and favorite-detail contracts. Favorite owner is enforced server-side and intentionally omitted from returned raw favorite; only validate owner when present, do not invent a mandatory field.
- [x] Editable design: Figma SXY4nF6NWwrsw3jxZOIaDU node 28:2, rendered and visually inspected. Retain existing approved red/white native direction under the user's overnight delegation.

## Task 1: Regression First

- [x] Add focused actual page-shell tests before production changes. Worker captured 26 initial failures and 3 follow-up failures; 35 final cases include parent transport retry regression. They cover malformed/false receipts, wrong source, hide/unload, stale identity/revision/product, repeat clicks, known-ID readback retry and explicit reading navigation.
- [x] Existing 1595 baseline was verified at the preceding checkpoint; preserve unrelated mutation assertions. New full run before the final two transport tests passed1629.

## Task 2: Narrow Native Implementation

Files: `miniprogram/pages/detail/index.js`, `index.wxml`, optionally one narrowly scoped helper; focused new tests; update only the existing knowledge-save fixture if strict receipt requirements require it.

- [x] Gate save by current visible loaded identity and exact loaded product/detail; preview must never write.
- [x] One in-flight write; reject malformed/negative receipts as unconfirmed, not success. Do not auto-resend after uncertain outcomes.
- [x] Store known favorite receipt in page RAM bound to original identity/product, including hidden late receipt; do not expose stale results. On same-page foreground, permit/read-only reconcile after fresh detail load, without repeating the write.
- [x] Validate favorite readback IDs, source_type recognition, source_id, optional owner and available source ID. Never display success or navigation for mismatched data. Source unavailable may confirm collection identity but must not invent readable-source or quiz permission.
- [x] Distinguish receipt received/readback pending vs confirmed favorite. Known-ID retry only calls knowledge-detail; explicit native reading CTA only after confirmed readback. Already-saved favorite details must not offer another knowledge-save.
- [x] Unknown receipt/error: state result not confirmed and offer the existing personal library as an explicit check path, not another automatic write. No persistence/exactly-once claim across unload/restart.
- [x] Leave generic writeAction, official favorite, community share, quiz grading and backend untouched. Independent review found restore-time hidden re-dispatch in the shared API; exact403 was a known pre-handler denial, not duplicate-write evidence. Exclude knowledge-save only from automatic renewal/re-dispatch. Parent transport test first failed1 with existing read-renewal control passing, then passed both after the one-line API change.

## Task 3: Verification And Handoff

- [x] Focused tests and independent review: 35 save cases,1 preview,215 related and18 additional independent probes; parent and independent full suite1631/1631, 25-route check and official26WXML/27WXSS compilers. No new confirmed P1/P2.
- [x] Real DevTools native preview screenshot; synthetic preview clearly marked and save disabled. No real employee writes or paid AI. Added an explicit synthetic history fixture, not a fake live result; preview contract first failed then passed20 combined tests.
- [x] Update parity/verification with receipt lifetime and live-data gaps; exact-path alternate-index commit18c5eeea, non-force push/readback; preserve normal index and phone data.
- [x] Create source archive and independently rerun checks from a clean extraction: 1631 tests,25 routes,26WXML/27WXSS. Archive hash and size are recorded in VERIFICATION.md. This is a local native initial build, not upload or release acceptance.
