# BOOMER GO Mini-program Implementation Plan

> For agentic workers: use bounded subagents for the disjoint native page groups; keep authentication, transport and integration on the main agent. Preserve unrelated checkout edits.

**Goal:** Runnable native employee mini-program initial release with the five approved tabs, existing features mapped, truthful live/preview state and no H5.

**Architecture:** Native WXML/WXSS/CommonJS pages. A shared authenticated wx.request transport calls existing OTP/scope/AI endpoints and the additive GO mini API. Server retains authorization and grading; ERP retains sales/employee attribution. The only preview fixtures are a separate explicitly labeled developer adapter.

**Tech Stack:** WeChat native mini-program, Node 22 test runner, official WeChat DevTools, existing Lovable Cloud backend.

## Tasks

- [x] Audit current web/native source, approve user-directed tabs and sales boundaries, create editable Figma file and written design.
- [x] Establish app configuration, native tab bar, shared style tokens and service/page interfaces; verify five tabs and prohibit web-view with `node --test tests/*.test.cjs`.
- [x] Implement transport/session red-green tests: OTP error, timeout, single-flight, scope rejection, fresh-session install, logout isolation, safe authorization. Verify no secret values in bundle.
- [x] Build workbench/learning/messages/mine and native schedule/list/detail/quiz/sales screens with scoped page worker and tests.
- [x] Build recognition/assistant/marketing native screens with scoped page worker and tests; save media only on successful native APIs, server persistence not fabricated.
- [x] Coordinate/deploy GO mini API with Lovable and inspect action schemas, authorization and grading evidence. Coordinate ERP leaderboard without changing sales assessment.
- [x] Integrate real action DTOs and preview fixtures; failures remain failures. Run route, security, interaction and syntax tests.
- [x] Open in WeChat DevTools using a separate tourist project, inspect five native tabs and critical flows, capture evidence and fix visual issues.
- [x] Record migration coverage, limitations and config/publish prerequisites. A preview/build is not a published mini-program or real-user acceptance.
- [ ] Complete genuine employee/device acceptance with a dedicated GO AppID, legal domains and privacy configuration; no credentials or approvals were invented.
- [ ] Complete remaining functional parity identified in FEATURE_PARITY.md, notably activity/voucher operations and role-specific operational writes. Initial native routes do not constitute complete migration.

## Follow-up: Employee Direct Messages

- [x] Read the existing web message/contact/attachment paths and RLS migration; distinguish staff DM from AI conversations.
- [x] Add editable conversation/chat design frames in the existing Figma file (3:32, 3:75); inspect the chat render. Detailed lifecycle and test plan: DM_NATIVE_PLAN.md.
- [x] Obtain the deployed, own-JWT DM contract from GO Lovable; verify pagination, read boundaries and send idempotency without expanding permissions. Round 12 replaces time-filter pagination with frozen snapshot IDs.
- [x] Add failing native interaction tests, then implement messages filters and native chat. Preserve private drafts on failure, stop polling off-screen and discard old-identity responses.
- [x] Integrate shared transport/preview and native route registration; verify backend DTOs, not guessed mock contracts.
- [x] Compile and visually inspect the native flow; update the coverage matrix. Official compilers passed all WXML/WXSS; synthetic contact, chat failure and community states have real DevTools screenshots.
- [x] Push the isolated follow-up commit `5aec64a1` to `pzy880723/boomeroff` branch `codex/go-mini-workbench`; verify the same SHA with ls-remote. Real two-employee acceptance remains a separate gate.

## Follow-up: Community and Release Gates

- [x] Add approved-style native community detail, complete business story, explicit likes and idempotent comments; verify 31 focused simulated tests and official WXML/WXSS compilation.
- [x] Add original-file DM upload/open checks, including identity changes during stat/upload/download and unconfirmed receipts; verify nine focused tests.
- [x] Reproduce same-user re-login retaining creative state; include session revision in creative scope and pass the regression.
- [ ] Finish the old Web bound-attachment compatibility review and establish an exact Tencent source baseline before promotion. Do not overwrite current production from the stale server source tree.
- [ ] Run dedicated-AppID legal-domain/privacy and two-employee/device acceptance. Tourist preview is not this gate.

## Shared Worker Contract

Root: `/Users/boomer/Documents/BOOMER GO Native/apps/boomer_go_miniprogram`.
Native root: `miniprogram/`. Import `const { definePage } = require('../../shared/page'); Page(definePage({...}));`.
Shared page helper installs `this.api`, `this.session`, `this.preview`, `this.run(async()=>{}, {silent:false})`, `this.go(event)` (`data-url` native route), `this.navigate(url)`, and `this.copy(event)` (`data-text`). It wraps lifecycle without overwriting worker handlers and exposes data `loading,error,preview`.
`this.session.get()` returns verified `{userId,shop:{id,name},profile:{display_name},isHeadquarters,shops}` or null. `require()` refuses unauthenticated and routes native login. No page puts tokens in data/WXML.
`api.action(action,params)` resolves the backend `data` object. Native normalized list contract: `{items:[{id,title,body,category,cover_url,...}],categories:[],...}`; detail may be `{item}`. Core actions include dashboard/schedule/learning/knowledge/knowledge-detail/quiz-start/quiz-submit/quiz-history/notifications/notification-read/profile/tasks/objectives/activities/vouchers/community/my-library/marketing-assets/marketing-detail.
`api.sales(params)` and `api.leaderboard(params)` call ERP. `api.recognize(photos,hint)` accepts local temp paths; `api.assistant(messages,conversationId,onDelta)` returns text and conversationId. `api.invoke(name,body)` is the authenticated existing Edge Function wrapper. `api.saveMedia(url,kind)` validates HTTPS sources and uses downloadFile then native album save; `api.copy(text)` uses native clipboard. UI never invents persistence, scope, scores or success.
Navigation: tabs pages/workbench/index, pages/learn/index, pages/recognize/index, pages/messages/index, pages/mine/index. Worker A owns workbench/learn/messages/mine/schedule/list/detail/quiz/sales. Worker B owns recognize/assistant/marketing/asset. Main owns app/custom-tab-bar/shared/config/assets/tests core/docs and integration.
