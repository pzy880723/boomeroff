# Publish History And Growth Native Migration Plan

> For agentic workers: use executing-plans and test-driven-development for these disjoint native migrations.

**Goal:** Recover existing store publishing tasks after leaving/restarting, and migrate the existing employee growth-level display without new backend privileges or writes.

**Architecture:** Add one read-only native publish-history route; caller-JWT fixed-table GET reads the current verified shop's latest50 jobs under existing RLS. Exact-ID status uses the existing dispatch-job-status endpoint with strict job/shop/target binding and whitelisted projection. Native Mine derives the existing25-level display from valid server EXP. Neither flow invents revenue attribution, assessment, persistence or new backend actions.

**Tech Stack:** Native WeChat JS/WXML/WXSS, existing shared page/session/transport, node:test.

## Source And Design

- [x] Previous turn changed authoritative source and pushed50efba16; classify as progress, not a wait or completion.
- [x] Current R36 handle polled: awaiting_input at a4d6edb0,20.3credits; no permission to continue. Do not bypass with a new task.
- [x] Fixed GO a4d6edb0 Web History.tsx reads social_publish_jobs under caller JWT, exact shop filter, created_at desc,limit50, nested target platforms. This is store-shared, not created_by-only; no server pagination snapshot/count.
- [x] Fixed dispatch-job-status returns job and targets (including target.job_id and platform_post_url). Existing legacy admin/profile gates are not remapped to Mini HQ. Same valid caller context and RLS remain required; no broad grants or service key added.
- [x] Fixed Web level.ts has25 thresholds, not the residual LevelCard label10. Valid EXP follows its formula; missing/invalid data is unavailable, not zero. No invented counts or reward-rate promises.
- [x] Editable Figma30:2 and30:15, rendered and inspected. Use existing approved overnight native red/white/gray direction. New route is secondary; five tabs stay unchanged.

## Task A: Native Publish History

Owner page: worker A, `pages/publish-history/index.{js,wxml,wxss,json}`, focused page tests. Parent owns shared API/transport/helper, app registration, marketing link, preview and integration tests.

- [x] RED tests for initial/return/manual refresh, list loading/error/empty/recent50, safe row click, exact status identity, independent detail retry/close, no automatic mutation, hidden/unload/stale identity/revision/store isolation and current401 shared protection. Page27 final cases include independent platform-key regression.
- [x] Implement native list with inline read-only selected task detail. Display title/type/status/platforms/created/scheduled times, targets status/progress/error and original link text only. Never open H5. No new retry/cancel/publish mutation in this history route; existing asset controls unchanged.
- [x] Frozen shared API contract implemented: `api.publishHistory()` -> `{shopId,items:[{id,title,kind,status,statusLabel,platforms:[string],createdAt,scheduleAt}],limit:50}`; `api.publishStatus(jobId)` -> `{shopId,job:{id,title,kind,status,statusLabel,createdAt,scheduleAt},targets:[{id,status,statusLabel,progress,error,platform,name,postUrl}]}`. camelCase is final safe UI projection; do not store raw rows or account credentials in page data.
- [x] Parent implements fixed GET table/fields/filter/order/limit with required caller token; no generic table-query API. Reject wrong-shop/malformed/duplicate/over50 rows and wrong job/target bindings; keep unknown statuses explicit. Scope freshness/revision checks before and after requests; no guessed missing shop. API20 cases pass after16 initial RED,2 array RED and1 missing-progress RED.
- [x] Add marketing entry and26th route, no change to five tabs. Explicit synthetic preview only, no real publishing; demo title/status clearly labeled. Two integration tests first RED then GREEN.

## Task B: Existing Growth Level

Owner worker B: `pages/mine/index.{js,wxml,wxss}`, narrow growth helper and focused tests. Parent owns preview fixture/docs.

- [x] RED exact25 thresholds/titles, lower/upper boundaries, valid0, missing/invalid numbers, max-level presentation, stale identity/revision/hide/unload isolation and rules toggle.51 initial RED plus3 lifecycle RED ->54 GREEN.
- [x] Reuse existing profile read; native level/title/progress/next-gap/max and expandable25-level threshold list. Do not replace server EXP with guessed0, fabricate activity counters or reward rules, or use sales data. Negative raw EXP remains visible with unavailable level, not silent normalization.
- [x] Preserve unrelated Mine menus, HQ store selector and profile/logout behavior. No new route/backend/write or phone operation. Independent original14 probes now pass after first-show duplicate-read fix.

## Verification And Delivery

- [x] Independent cross-review, parent full1734/1734,26 native routes and official27WXML/28WXSS compilation; no remaining confirmed new P1/P2.
- [x] Actual DevTools synthetic history/detail and Mine/rules screenshots; do not claim real employee/release acceptance from preview. Native close/expand/scroll/collapse were operated, no real writes.
- [ ] Update current parity and verification, exact-path alternate-index commit and non-force GitHub readback. Preserve normal index/Flutter branch and phone data.
- [ ] Generate immutable source archive and clean-extraction test/check/compiler rerun; retain AppID/real-user/budget/full migration gates.
