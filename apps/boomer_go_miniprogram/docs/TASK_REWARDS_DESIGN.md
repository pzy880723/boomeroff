# Native Current-Reward Inbox

2026-10-16. This migrates an existing reachable employee Web action under the approved overnight native-workbench direction. It does not add task rules, sales assessment or a new reward system.

Status: native implementation and local synthetic verification complete at this checkpoint; real employee reward acceptance has not been performed. The 23-route app still uses touristappid and has not been published.

## Verified Existing Scope

Fixed GO Web `813c12840f12a904fd07e6bc3a8bb08359b01090`: Home.tsx uses RewardInboxCard. Its batch action first traverses loaded pending-experience events, then completed and unclaimed daily tasks. useTasks reads the caller's latest 50 pending events and four fixed daily rules. No reachable task-rule configuration or complete OKR create/delete editor was found in App.tsx, the home registry, Portal and ShopManager; a writable table alone is not evidence of such an employee feature.

The deployed tasks action returns date/items/pending_items/claimed_today/today_counts. task-claim accepts one pending_id or one of the four daily task keys. Existing RPCs own eligibility and duplicate-claim behavior; no new backend action or permission is proposed.

## Native Design

Editable Figma states: [Ready](https://www.figma.com/design/SXY4nF6NWwrsw3jxZOIaDU?node-id=19-2) and [Uncertain Result](https://www.figma.com/design/SXY4nF6NWwrsw3jxZOIaDU?node-id=19-36). Both were rendered and inspected. They reuse the existing native red/white cards, readable 16px text and 50px action. All design values are labeled synthetic, not real rewards.

Keep the existing secondary task list and per-item detail. Add a current-loaded reward summary, one explicit confirmation action and per-item outcomes. Confirmation names the server date, loaded pending count and eligible daily count; it never says all historical rewards. The latest-50 window is explicit. This is not an atomic batch.

## Behavior And Safety

1. Freeze only caller-loaded eligible IDs/keys after validating the tasks DTO; pending events precede daily tasks, as in Web. A second tap or stale confirmation cannot start another batch.
2. Submit serially using the original deployed single-item action. Only valid server confirmation amounts contribute to the confirmed total. A known eligibility rejection is a separate outcome, not an award. An unknown result or lost authorization stops subsequent submissions.
3. Re-read current tasks after processing without treating list disappearance as an independent proof of claim: the latest-50 window can move. Preserve explicit receipt/rejection/unknown outcomes even if refresh fails. Do not silently resend an unknown request or declare that all rewards were received.
4. Hide/unload/identity/revision changes stop later submissions and prevent old callbacks from painting another context. Return to the page by reading current state, not by resuming writes. Preview never calls a mutation.
5. Check the Shanghai business date before submitting a daily task. Existing task-claim has no atomic expected-date parameter or batch snapshot, so the client must not claim strict cross-midnight snapshot guarantees or cross-device atomicity. Server eligibility remains authoritative.

## Implementation And Verification

Keep changes within the current task branch of pages/list, a small reward helper if needed, focused tests and labeled development fixtures. No new tab, H5, invented test credentials or business writes. Tests must cover pending-plus-daily order, actual receipt amounts, partial rejection, unknown stop, double tap, stale modal/page/identity, failed refresh retaining results, preview zero writes and date change. Inspect the actual DevTools ready/disabled-preview state after the full suite and official compiler pass.
