# Visible Sales Refresh Implementation Plan

**Goal:** Keep the existing native workbench sales card and sales/leaderboard screen current while visible, without inventing revenue, changing permissions or affecting assessments.

**Architecture:** Reuse existing read-only ERP adapters and native red/white cards. Poll only these financial reads about30seconds after the preceding read settles; no overlapping timer reads, no automatic writes, no background polling and no preview ERP calls. Retain the actual source freshness timestamp. A page-owned context/epoch rejects hidden, unloaded, replaced period or identity/store results. Return-to-page reads immediately; first onLoad/onShow must share one load.

**Tech Stack:** Existing WXML/WXSS/CommonJS, native lifecycle, deterministic Node VM/fake-clock tests. No package, backend endpoint, AppID, permission or database change.

## Design Decision

This is a correction to the already approved native employee-workbench design, not a redesign. Keep five tabs, routes, fonts, card hierarchy and controls. Add one concise muted line explaining foreground30second refresh and server-source delay; preview says no real ERP refresh. Do not label polling as a websocket stream, instantaneous POS data or a completed personal-attribution solution. Existing month-summary gap remains explicit.

Alternatives: manual-only refresh leaves the requested live view stale; persistent background polling wastes resources and can apply hidden results; choose visible-only serial refresh. Use existing chat-style lifecycle cancellation. Share a small refresh helper only if it materially removes the two pages' identical scheduling/state logic; otherwise keep it local.

## Ownership And Steps

- Parent owns this plan, parity/verification docs, final UI inspection, alternate-index checkpoint and archive.
- Page worker owns only pages/workbench/index.js, pages/workbench/index.wxml, pages/sales/index.js, pages/sales/index.wxml, a small shared helper if justified, and new tests/sales-refresh.test.cjs. Existing test timer harnesses may change only to inject inert/fake platform timers, preserving assertions and reporting every such file. No Git or backend action.
- Independent reviewer owns read-only source/reproduction review.

- [x] TDD: demonstrate old lack of visible refresh/return refresh and hidden-result cancellation. Include first-show single flight, in-flight timer overlap, manual/period refresh, old errors, current401 versus stale401, preview/no-shop and unload. Worker26RED+2RED; later visual1RED all corrected.
- [x] Implement foreground refresh without rerunning workbench bootstrap/tasks each tick. Both financial channels settle independently; failures clear their own old snapshot. Small shared visible-financial-read helper removes duplicate scheduling logic.
- [x] Hidden/unloaded pages stop timers and reject late callbacks. A new visible context cannot be unlocked or overwritten by an older finally. No timer authentication, OTP or business mutations.
- [x] Verify deterministic tests and all regressions: refresh40, API9, full1595. Old harness timer injections preserve assertions; new fake-clock tests exercise actual scheduling.
- [x] Independent current-source review found no confirmed new P1/P2. Parent25-route check and official26WXML/27WXSS compilers exit0 with empty stderr.
- [x] Inspect actual DevTools preview wording/layout, without manufacturing revenue or ranking examples. Workbench duplicate preview hint removed; GUI confirms empty overview/ranking, not authenticated polling.
- [x] Push Mini-owned source only, verify remote SHA, archive and rerun clean extraction. Sourcea3c74207 contains21 Mini paths;1595 tests/25 routes/official26WXML+27WXSS repeat successfully. Normal Flutter checkout/index and phone state stay unchanged.

## Acceptance Boundary

Real employee/source latency, personal sales attribution, month aggregate, AppID and WeChat release are still unverified or incomplete. R36 remains at its human spending check-in; this local read-only correction does not answer or bypass it.

Parent also owns shared/api.js, tests/sales-period-api.test.cjs and the existing mapping fixture's date echo. Nine tests bind actual request/response business day/month and reject an in-flight result after Shanghai rollover. Initial5RED+1control, then3rolloverRED were observed before the respective changes. No source-freshness flags were fabricated. Public anonymous probes for session/daily-summary/leaderboard return401 missing_token; this does not prove employee amounts or attribution.

Archive `/private/tmp/BOOMER-GO-wechat-visible-sales-20261016.zip` is10470651 bytes, SHA256 `6ce2f5e552fe29c5fab2d11afd22b348575b4a8c252b24f39d45c35698237339`; clean extraction `/private/tmp/go-mini-visible-sales-verify-Dx1JvD` repeats all checks. This checkpoint does not close genuine employee/source-latency, month-summary, attribution, AppID, backend or publication gates.
