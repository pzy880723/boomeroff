# Native Schedule Management Design

Status: source-backed candidate design, not an implemented manager page or deployed BFF. Fixed Web comparison `813c12840f12a904fd07e6bc3a8bb08359b01090`. The existing personal-month read fix is independent of this work.

## Editable Design Review

The existing BOOMER GO Figma file now contains two editable 390 x 844 secondary-screen states, with the same typography, red/white cards and readable spacing as the approved five-tab design:

- [Weekly overview](https://www.figma.com/design/SXY4nF6NWwrsw3jxZOIaDU?node-id=16-2): seven day cards, explicit authorized shop and week, no assumption that an unassigned day is a day off.
- [Single-day editor](https://www.figma.com/design/SXY4nF6NWwrsw3jxZOIaDU?node-id=16-36): fixed employee/date, original assignment, eligible shift choices, a 50px review action and a separate 44px removal action.

Both states use clearly labeled synthetic data. The actual Figma renders were inspected; a collapsed action was corrected and rendered again at the intended touch height. These are design evidence, not Mini Program screenshots, backend write evidence or real-employee acceptance. The next native implementation must preserve the existing secondary-page navigation and require the exact shop/employee/date/original-to-new confirmation described below.

## Native Interaction

Retain the approved five tabs and current read-only month page. A separately authorized secondary management page uses the existing grey canvas, white cards, BOOMER red, 16px body and 44px touch targets. Do not copy a desktop-wide spreadsheet.

- Header: current authorized shop, Monday-Sunday week range, previous/current/next week.
- Seven date cards: real shift times and staff; an empty date is not automatically rest.
- Add/edit opens an inline editor with server-provided candidate employee and shift UUID. Editing fixes employee/date; it cannot silently transfer a record.
- Explicit confirmation names shop, employee, date and original-to-new shift. Removing an assignment is separately confirmed and does not create a day-off record.
- Writes are immediately effective under existing Web semantics; do not invent a separate publish state or claim an employee notification was sent.

## Full Target

1. Single-cell create/change/remove, first implementation boundary.
2. Shift definitions by UUID/store with independent shift.write, reference checks and explicit shared-scope rules; never update all stores by code.
3. Blocked days with independent dayoff.write; no bundled phone, role or employee-store authorization editing.
4. Atomic two-cell swap with both versions checked; no temporary all-zero employee ID.
5. Week clear with schedule.clear, exact target count and set-version check; do not remove assignments added after confirmation.
6. AI schedule with schedule.ai, candidate preview and explicit adoption; no old privileged direct-write endpoint and no five-day cap.
7. Existing holiday maintenance retains independent holiday.write.

These are migration requirements, not optional features removed by the first boundary.

## Required Backend Contract

The original read RPC cannot authorize writes or supply management CAS/receipts. Stage1 now has a separately implemented fixed R30 action contract in SCHEDULE_MANAGER_STAGE1_NATIVE.md. Further swap/clear/settings/day-off/AI actions remain unfrozen and must not be invented by the client.

The independent R28 Stage1 build request is recorded in SCHEDULE_MANAGER_STAGE1_CONTRACT.md. It does not approve or implement the separate pending R27 content-home proposal. Independent R29/R30 source review closes the three original SQL P2 findings and residual hidden-suspension inference. SCHEDULE_MANAGER_STAGE1_AUDIT.md records exact evidence and separates deployment reports from independent checks. The native Stage1 manager is now integrated; real authenticated write/readback acceptance is still open.

Capabilities must independently report view, arrange, shift, day-off, swap, clear and AI authority for the requested shop. Bootstrap permissions may suggest an entry, not authorize an operation. Role names and can_view_shop never imply write permission.

Week read needs exact shop/start/end, week_version and minimal assignment/day-off projections. Employee candidates need server-scoped search/paging. Cell read needs assignment-or-null, cell_version even for an empty cell, active eligible shift UUIDs/versions, applicable warnings and current save/delete capabilities.

Writes bind shop, employee, date, operation, assignment ID, expected cell version, shift UUID and explicitly acknowledged warnings. The actor and timestamps come from the server. Receipt must bind the original actor/request/shop/employee/date/operation/assignment/version/deleted flag and recorded time. Status lookup must use the original immutable request identity; not_found does not prove the operation never ran.

## Client State

Edit -> explicit confirm -> freeze UUID/payload -> submit -> validate exact receipt -> exact cell readback. Conflict keeps the draft; only explicit load-latest adopts another version. Unknown operations keep minimal actor/shop/employee/date-bound App RAM intent, never auto-resend or silently replace a key. A confirmed receipt with failed readback retries only the read. Hiding or losing permission hides private UI; recovery first rechecks current capabilities and never moves an old intent to a new store.

Implemented files: pages/schedule-manage/index.js/json/wxml/wxss and model.js; tests/schedule-manager.test.cjs. Shared API, route registration and labeled preview follow the frozen Stage1 contract. The independent month-page entry never blocks personal month loading or infers management authority from role names.

## Evidence and Verification

Web ScheduleManager direct writes and three-step swaps are not safe atomic native APIs. ShiftSettingsPanel code-based multi-store mutations are not a UUID/store contract. Existing schema has no management version/published field to rely on.

Required tests include capability separation, foreign-store staff, seventh-day assignment, simultaneous edits, rule changes, draft preservation, exact receipts, unknown recovery and old identity callbacks. Preview stays synthetic with zero write/status calls. Full Node/compiler/GUI checks and authenticated acceptance remain separate gates.
