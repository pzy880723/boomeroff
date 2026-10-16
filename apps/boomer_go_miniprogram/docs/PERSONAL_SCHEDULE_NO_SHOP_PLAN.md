# Personal Schedule Without Today's Shop

Goal: an authenticated employee can read their own month when today's working shop is empty. This fixes a proven local/BFF precondition bug without inventing canonical home, changing permissions or implementing schedule writes.

Evidence: fixed GO `813c128`, `list_shift_schedules_v1(_from,_to,_shop_id)` permits NULL shop and returns caller work/rest rows across their real assignments. Managers may additionally receive authorized coworker rows. It is a SECURITY DEFINER function with explicit scope/owner filters, not automatic caller table RLS. Existing BFF already calls it with NULL for mine but first unnecessarily requires selected shop.

## Design

Keep the approved native month/calendar and mine/shop controls. Only mine with no selected shop uses the existing authenticated RPC directly; selected-shop mine and coworker reads retain the existing BFF path. No new route, tab or manager button. Errors remain errors, never an empty calendar.

## Narrow Adapter

- Capture caller identity/revision and use existing ensureFresh/refresh. Verify auth:user against the captured uid and check erp_scope_fresh_v1 strictly true before the read. Recheck fresh and identity/revision before returning results. Do not rely on the local 30-second cache as the server fresh check.
- Fixed request: `rpc:list_shift_schedules_v1`, `{_from:firstDay,_to:lastDay,_shop_id:null}`. No user_id, guessed home, array-first shop, caller-controlled shop or write operation.
- Validate exact month range, returned scope and NULL shop, strict boolean capability and arrays. Whitelist only rows/conflicts whose user_id equals the verified caller. Recompute is_self from uid, strip all unlisted fields, and suppress coworker capability in no-shop mode.
- Return the existing native DTO `{month,view:'mine',shop_id:null,can_view_shop:false,rows,conflicts}` to the strict decoder. Do not remove the caller's genuine historical/transfer records merely because their shop is outside today's authorized set.
- No automatic retry of denied/unknown RPCs, no legacy DTO fallback, and no sensitive raw error text. Propagate current auth failure through existing page handling; stale callbacks cannot sign out or render over a new identity.

## Files and TDD

1. Add `tests/personal-schedule.test.cjs`: RED first for no-shop mine, explicit rest/unscheduled, leap/non-leap/full months, caller-only projection with manager raw DTO, malformed scope/range/arrays, strict fresh before/after, verified actor mismatch and lifecycle/revision races. Existing selected-shop and shop-mode tests must remain green.
2. Add a focused `shared/personal-schedule.js` adapter; narrowly integrate shared/api.js. Use existing caller-JWT transport for auth:user and fixed RPC names, never service credentials.
3. Change schedule/index.js only so no-shop mine can load with context.shopId=null. Shop mode still requires selected shop and server capability. Test native page hide/unload and identity changes.
4. Run full tests, route checker, official compilers and actual DevTools normal-calendar regression. A no-shop preview may be synthetic only; no real employee/OTP or schedule mutation tests.
5. Independent review, mini-only Git push and isolated source-archive tests. Document that manager writes, canonical content-home, dedicated AppID and real employee/device acceptance are still open.
