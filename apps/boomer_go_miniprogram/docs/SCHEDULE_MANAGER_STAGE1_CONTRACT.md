# Schedule Manager Stage 1 Contract

Status: original independent R28 implementation request, not acceptance evidence. This does not approve, reject or implement the pending R27 content-home plan. At dispatch, GO ref f68fd864 differed from 813c128 only in .lovable/plan.md. R28/R29/R30 later returned source/deployment reports; SCHEDULE_MANAGER_STAGE1_AUDIT.md records the independent source reviews and R30 closure. The frozen current DTO and native integration are documented in SCHEDULE_MANAGER_STAGE1_NATIVE.md; this original request does not prove authenticated acceptance.

Goal: a genuinely authorized manager can view a week and create/change/remove one employee/date assignment using existing GO scheduling data and permissions. The full SCHEDULE_MANAGEMENT_DESIGN.md target remains; swap, week clear, definitions, blocked days and AI follow separately rather than being dropped.

## Authority and Data

- Caller uid, suspension, fresh ERP scope and requested-shop membership are server-owned. Preserve existing schedule view authority and schedule.write separately; no role-name inference, new cross-store access, new business permission or five-day cap.
- Preserve caller RLS for reads. Do not expose employee phone, email, identity credentials, roles or unrelated profile fields. Candidate eligibility follows verified existing Web business rules and actor-visible records; staff profile shop fields do not grant new account/store authority.
- Writes use one narrow atomic operation with the original schedule.write check. Do not copy non-atomic Web swaps or full staff-profile editing. Shared/global shift definitions require deterministic code resolution; never silently store a different shift from the selected UUID.
- Do not change ERP mirrors/home fields, current_shop_context, existing schedule RPC semantics, table grants/RLS or other products. New receipt tables are private with no client table grants. Narrow RPC EXECUTE is limited to the original authorized operations.

## Actions

All use explicit shop_id, original caller JWT and existing fresh-scope BFF gate. Exact code locations/migration filename are returned by the backend owner, not invented in the client.

1. `schedule-manage-capabilities {shop_id}` returns shop_id, can_view, can_arrange and server_time. Existing permissions for shift/dayoff/swap/clear/AI may be reported independently but do not enable unsupported endpoints.
2. `schedule-manage-week {shop_id,week_start}` returns exact Monday-Sunday week_start/week_end, week_version, rows and server_time. Minimal rows bind assignment id/user_id/display_name/work_date/shop_id/shift_id/code/name/start/end/source/version. Unknown/ambiguous shift references are explicit, never guessed.
3. `schedule-manage-candidates {shop_id,work_date,q?,cursor?}` returns bounded caller-visible employee IDs/names, exact request binding and next_cursor/has_more. No arbitrary users from mutable client fields.
4. `schedule-manage-cell {shop_id,user_id,work_date}` returns exact binding, assignment-or-null, cell_version even when empty, eligible active shift UUIDs/versions, warnings, can_save/can_delete and server_time. An existing foreign-shop assignment is a hard conflict, not permission to edit another store.
5. `schedule-manage-write {shop_id,request_id,operation,user_id,work_date,assignment_id?,expected_cell_version,shift_id?,acknowledged_warnings?}` supports create/update/delete. Actor, creation time, version and permissions are never client-supplied.
6. `schedule-manage-write-status` looks up only the original actor/request/shop/employee/date/operation binding, including removed assignments. Return not_found or the exact original receipt; not_found is not proof of non-execution.

## Atomic Write Rules

Serialize the original actor/request, then the global employee/date cell; preserve the existing UNIQUE(work_date,user_id). Gate authority before receipt lookup. Canonical normalized payload hash rejects key reuse for another intent. Exact original replay precedes CAS; the mutation and receipt commit together.

Cell version covers occupancy and relevant assignment/rule state, including empty cells. Lock and recheck current assignment, eligible target, active shift/reference and soft-warning facts before writing. Another-store occupancy is never overwritten. Missing or changed confirmations return explicit warning/version errors; a matching acknowledged warning cannot silently override a newer rule.

Receipt binds request_id, actor_id, shop_id, user_id, work_date, operation, assignment_id, version, deleted, recorded_at and replay. Delete writes no day-off record. No separate publication/notification success is invented. Seventh-day assignments remain allowed when existing rules/explicit warnings permit them.

## Verification and Handoff

TDD first: synthetic rollback fixtures only. Test no auth/stale/suspended/revoked/foreign shop, read versus write capabilities, actor-visible candidates, create/update/delete, empty-cell CAS, foreign-store hard conflict, active/global/duplicate shift references, changed warnings, seventh day, exact replay/key conflict, status after delete and revoked receipt access. No real employee writes, OTP, AI calls or messages.

Require fixed commit, changed files/hashes, applied migration status, Edge deployment status, exact DTO/error examples, SQL rollback/residual evidence and regression counts. Independently read the final source before wiring native UI. No Tencent release or real employee acceptance is implied by backend deployment.
