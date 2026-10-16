# Schedule Manager Stage1 Native Contract

2026-10-16. This freezes the client contract after independent R28/R29/R30 source review. It is the first boundary of the full schedule migration, not a replacement for swap, week clear, definitions, blocked days, holidays and AI scheduling.

## Verified Backend Source

Final GO ref `021a5adbe3e0146cffcae69de5a38e49fcc3949b`. R29 Edge hashes remain unchanged by the R30 diff: schedmanage.ts `34ea680af4a105ed30fa59c2010969ec7ab14b292967e90d126e1f2545078d17`, index.ts `b578784478beb56b434eec09884a7e38be8746992beb51dc81ec9b82d1fd2eac`. Migration 0025 hash `00060e5c5c5a6caf594498fcec32b56f9b698c0e39c230f2fc77f1e0ae03d52d`, R30 SQL test `80764d7d28a70dbcd89c62d6eff9f5f19a41e13264df61ec2b2fd05699404a07`, both independently recomputed. R29/R30 source reviews close the confirmed P2 findings; no new P1/P2 confirmed. This does not prove real SQL concurrency or employee acceptance. Deployment/application remain backend-owner reports.

Public candidate visibility no longer discloses hidden suspension. Therefore can_save true is only permission to request a write, not final private eligibility: create/update may return generic not_found. Keep original actor/store authorization, no role-name inference or guessed home.

## Native Surface

Implement pages/schedule-manage/index.js/json/wxml/wxss plus a small model and focused tests. Reuse Figma 16:2 week and 16:36 cell editor. Keep the five tabs. Parent owns shared API action registration, route, labeled preview and separately authorized entry from the personal schedule. Loading personal month must not wait for management-capability lookup; no selected shop means no management call or guessed fallback.

The secondary page shows the exact verified shop and Monday-Sunday week, seven day groups and real shift resolution status. Only can_arrange enables add/change/remove; a reader is not a writer. Employee selection uses paged server candidates and literal search. Existing assignments fix user/date. A close action exits the inline editor without side effects; unsaved changes require confirmation when needed.

The final modal names shop, employee (or an explicit unresolved-name identifier), date and original-to-new shift. Removing is separately confirmed and never creates a day-off row. Writes are immediately effective; no invented publish phase or employee-notification success.

## Exact Deployed Actions

- schedule-manage-capabilities {shop_id}: shop_id, strict can_view/can_arrange, existing_permissions booleans, implemented_operations create/update/delete, server_time.
- schedule-manage-week {shop_id,week_start Monday}: exact shop/start/end, week_version 64 lowercase hex, rows and server_time. Each row: assignment_id/user_id/display_name/work_date/shop_id/shift_id/shift_code/shift_status resolved|ambiguous|unresolved/shift_name/start_time/end_time/source/version. Never infer time from an ambiguous/unresolved code.
- schedule-manage-candidates {shop_id,work_date,q?,cursor?}: exact shop/date, items user_id/display_name, next_cursor UUID|null, has_more. Limit20 and literal trimmed q at most40 Unicode characters. Reject repeated/non-advancing cursors or malformed binding.
- schedule-manage-cell {shop_id,user_id,work_date}: exact binding, assignment|null, cell_version 64hex, shifts, warnings, rules_visible strict boolean, can_save/can_delete, server_time. Assignment has assignment_id/user_id/work_date/shop_id/shift_code/source/version. Shift has id/shop_id nullable/code/name/start_time/end_time/version/selectable. A shared shift must be explicitly null-shop; duplicate-code selectable false is not silently resolved.
- Warnings: weekday_unavailable/fixed_rest_weekday/day_off with null shift_id, blocked_shift with exact shift UUID, all soft; occupied_other_shop is hard and reveals no other shop. Show soft warnings applicable to the selected shift and require their explicit current confirmation. rules_visible means profile rules, not every possible private source; say only that visible warnings are shown.
- schedule-manage-write: exact shop/request_id/operation create|update|delete/user_id/work_date/assignment_id nullable/expected_cell_version/shift_id nullable/acknowledged_warnings string codes. Create has no assignment_id and non-null shift_id; update has both; delete has assignment_id and no shift_id/acknowledgments.
- Write receipt: request_id/actor_id/shop_id/user_id/work_date/operation/assignment_id/version/deleted/recorded_at/replay. Validate every binding against the frozen original intent, including exact assignment for update/delete, actor and valid timestamp. A receipt must be followed by exact cell readback; deletion returns the deleted row version, so the empty-cell version is not required to equal it. Do not silently claim success if another write changed the cell after this receipt.
- schedule-manage-write-status: exact original shop/request_id/operation/user_id/work_date, state not_found|succeeded and receipt|null. Validate wrapper and receipt. not_found never proves non-execution.

## Request State And Recovery

Read current capabilities before accepting data or restoring an intent. Freeze a new request UUID and complete payload only on explicit final confirmation. One operation is single-flight. A known initial 400/403/404/409/422 transaction rejection can retain the draft for explicit refresh/reselection; never auto-resend, replace a key for an uncertain operation or reinterpret a later rejection as proof an earlier uncertain request failed.

Unknown writes retain only immutable actor/shop/user/date/request/payload in an App RAM map, following the existing voucher/category pattern. No names, credentials or disk persistence. Hidden/unloaded UI clears private content and stops old callbacks, but preserves the minimal original intent for the same actor/store to explicitly check status after fresh authorization. Another actor/store never adopts it. A status-confirmed receipt with failed readback retries only the read. If explicit same-request retry is offered after not_found, require separate confirmation and reuse the identical original payload/key; do not build it from refreshed versions or auto-execute it.

Fresh capabilities restore the exact original RAM intent before cell reading. A legitimate cell404 after removing an ineligible target does not block receipt/status recovery, but is not deletion/readback proof. Retain the request and pending-readback state while the current cell remains unreadable; do not release RAM, declare completion or offer a resend from that404.

Current 401 uses shared page handling; old 401 cannot sign out a new context. Losing permission hides private UI, does not erase another context's recovery record and grants no old authority. Preview reads are synthetic, labeled and write/status handlers must remain zero-call.

## Implementation Plan

- [x] TDD failing model/page tests from the exact DTO above: independent capabilities, all seven days, binding/ambiguous shifts, search paging, current warning confirmation, create/update/delete receipts/readback, conflicts/draft retention, unknown/status/delete recovery, auth/lifecycle and preview. Final manager75, entry51; independent404 recovery finding received5 RED then fixed.
- [x] Implement the native page/model within the worker-owned paths, no shared API or existing-page edits.
- [x] Parent integrates actions/route/read-only preview and capability-gated schedule entry without blocking the personal month or changing no-shop behavior.
- [x] Independently review, run all tests, route checks and official compilers; inspect actual DevTools secondary page/editor in synthetic mode. Parent and independent1211/1211;24routes;25WXML/26WXSS successful. Actual candidate/editor/warning/close states inspected, no real writes.
- [x] Commit only Mini paths, non-force push and read back the exact SHA, verify clean-extracted source archive. Source checkpoint279ef3d6500acc9d41b2571481e8b35dd26aa451 contains25 Mini-only paths; normal index stays empty. Clean archive1211/1211 and24-route check passed;976206bytes, SHA256c9d67051cbeaf0ccde325d2961e3e91acdcbaa03a5dabf01bf6095734363f6df. Real employee/AppID/device/publication gaps remain explicit.
