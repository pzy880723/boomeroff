# Current Reward Inbox Implementation Plan

> For agentic workers: implement task-by-task using executing-plans and test-driven-development. Ownership is deliberately split between the list-page worker and the parent's preview/documentation work.

**Goal:** Migrate the existing loaded pending-plus-daily reward-claim action into the native task list without inventing atomic, all-history or fixed-date guarantees.

**Architecture:** Reuse existing tasks and task-claim actions and original server eligibility. A page-bound frozen queue is submitted serially only after explicit confirmation. Per-item server results survive a failed refresh; unknown outcomes stop further writes.

**Tech Stack:** WeChat WXML/WXSS/JavaScript, existing native page/session helpers, Node test runner and official WeChat compilers.

## Tasks

- [x] Read actual reachable Home/RewardInboxCard/useTasks and deployed BFF/RPC semantics; record limits and date caveat in TASK_REWARDS_DESIGN.md.
- [x] Create and inspect editable Figma ready/uncertain-result states 19:2 and 19:36 using existing BOOMER styles.
- [x] Worker: add failing tests in tests/task-rewards.test.cjs for queue order, receipts, partial and unknown outcomes, races, dates and preview zero writes; run and record expected failures.
- [x] Worker: implement only pages/list/index.js/index.wxml/index.wxss and a small rewards.js helper if needed. Preserve other list types. Run the focused tests to green; report any old fixture that does not match the deployed tasks DTO.
- [x] Parent: add a failing preview-contract test, then align shared/preview.js with four daily rules and bounded pending samples; retain disabled mutation behavior. Correct only demonstrably inaccurate old test fixtures.
- [x] Independently review the final changes, run the full Node suite, route checks and official WXML/WXSS compilers. Fix confirmed regressions before proceeding.
- [x] Inspect the actual DevTools task list and disabled-preview state; retain real screenshots, not Figma renders as implementation evidence.
- [x] Update the current parity matrix and verification record, commit only Mini Program paths through the existing alternate index, non-force push/read back the same SHA, and verify the source archive in a clean extraction. Reward checkpoint f4f6d6f99ab24ff04c3d914c8c4323d1349973ae; clean archive 1071/1071 and 23-route check passed, SHA256 85a15c86e787f3c6562658aa9d043d280fc90b21ab99891a99169a5cb573cac7.

No step creates new backend permissions, consumes real rewards, sends OTP or operates the existing phone app. The later independent R29/R30 scheduling source review is recorded separately in SCHEDULE_MANAGER_STAGE1_AUDIT.md.
