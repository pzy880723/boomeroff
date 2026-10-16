# Content-Shop Context Audit

2026-10-16. Read-only source audit, not an implemented authorization change. GO backend fixed ref: `813c12840f12a904fd07e6bc3a8bb08359b01090`.

## Confirmed Cause

`current_shop_context_v1` in `20260915003501_0def3053-8242-4c8b-8ba9-79414cb780e7.sql` intentionally leaves effective_shop null on rest/unscheduled days. Native session.js takes only effective_shop, so store-bound actions cannot begin. Native KB migrations 0019/0021 separately require the same daily effective shop; a client fallback alone would not fix them.

Existing Web KB permission and write RLS use can_write_scoped membership plus action permission, not today's schedule. A future correction must not invent a new rest-day prohibition on otherwise authorized KB maintenance or drafting. Shared entries/categories remain read-only.

## Home Authority Is Not Established

The latest audited staff_profiles INSERT/UPDATE policies in `20260907172958_56cd4864-1dd8-41b5-9393-c7c0fd458ede.sql:458-466` have an own-user branch with no shop_id constraint. No later protecting column ACL or trigger was found in the audited source. This is not proof that an actual production UPDATE succeeded; no employee rows or privileged catalog queries were run.

The current ERP payload parser `_shared/erp-scope.ts` and mirror RPC record authorized shop mappings, not an explicit canonical home/primary shop. Reading staff_profile.shop_id from the server does not make that field an immutable authority. Neither first/only authorized membership, array order, a cached selection nor historical shifts can establish home ownership.

Consequently no home fallback has been installed. A trustworthy existing ERP home source, or an explicitly approved versioned canonical binding contract, must be established before enabling it. Do not create a second employee identity database or broaden table grants/RLS.

## Intended Separation

- Keep daily effective_shop/self_schedule/status and schedule RPC semantics unchanged.
- A separate server-owned content_context must bind actor, Shanghai date, current scope/version and explicit shop/source; no guessing.
- Preserve existing HQ explicit authorized selection, not an automatic first-shop choice.
- Recompute each server gate. Content selection never grants an action permission. Existing capability, CAS and original-request receipt checks remain.
- Changes in actor, authorized set, content source, working shop, scope version or date must invalidate old callbacks and caches. Unknown writes retain their frozen original shop/request/payload and must not migrate stores.
- ERP sales still require its own mapping, visible_locations and backend scope. No content fallback can expand that authority. An older local ERP bridge source explicitly restricts rest-day sales; that older checkout is not proof of the current deployed revision.

## Direct Lovable Coordination

R27 plan tasks `umsg_01m512sbagf3vaeyhrhkjb9med` and revised `umsg_01m512x27teag9p5f3g5efh0qy` were sent directly to GO Lovable. They are planning only, not implementation/deployment evidence. The revised plan paused at plan--show for human decision; it has not been approved. Its claim that go-mini lacks dashboard is contradicted by fixed index.ts (dashboard calls app_bootstrap_v1). Its claim that native real-time sales are simply a 501 is also incomplete: the client uses the separate ERP bridge. These must be corrected before implementation.

No code, SQL migration, real employee record, paid AI, SMS, voucher or Tencent release was changed by this audit. The active migration goal remains incomplete; the safe independent workbench shift-binding correction is tracked separately.
