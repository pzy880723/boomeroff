# Native Notification Reading And Management Plan

> Workers: use executing-plans and test-driven-development. Scope is this subsystem, not a declaration of complete Web migration.

**Goal:** Repair native notification detail beyond page one and migrate the existing authorized manual system-notification workflow without H5, new rights or paid generation.

**Architecture:** Existing BFF pagination supplies employee reading. A secondary native manager uses fixed caller-JWT REST on the existing global notifications table. Management requires both fresh bootstrap `role.manage` and strict caller-bound `user_has_permission` true, not HQ/legacy role inference. Existing RLS remains authoritative; this client gate is not an atomic server ERP authorization rewrite.

**Tech Stack:** WXML/WXSS/JS, existing session freshness, fixed REST/RPC, node:test, official WeChat compiler.

## Evidence

- [x] Previous goal turn is concrete progress: manual-copy sourcea2742b23/docs79a4b026 pushed and archive clean-verified1846/27routes.
- [x] Correct GO R36 handle was polled again: awaiting_input,a4d6edb0,20.3credits,no approval object. Do not continue, supersede or bypass.
- [x] Fixed Web NotificationManager provides latest50, manual title/body, active, Shanghai end-of-day expiry, create/edit/toggle/delete. Separate Notifications composer includes local drafts, HTML/Markdown, images and AI; those are distinct remaining work, not silently counted as this subset.
- [x] notifications has id,title,body,type,active,expires_at,created_by,created_at,image_url,category,summary. No shop_id,updated_at,version,request receipt. Delete cascades notification_reads, not employee accounts. No new GRANT/policy/SQL.
- [x] Fresh bootstrap permissions use ERP actions; notification RLS uses existing GO role matrix. Intersect both; do not expand either or infer role.manage from HQ. Source does not prove live table GRANT/actual employee CRUD.
- [x] Figma34:2/34:19 rendered and inspected: native list/editor, global audience, explicit confirmation, pending read-only recovery, existing red/white/gray type/field/button styles.

## Frozen Contract

Worker API owns `shared/notification-manage.js`, `shared/notification-manage-api.js`, minimal `api.js/transport.js` wiring and `tests/notification-manage-api.test.cjs`. Page worker owns `pages/notification-manage/index` quartet and its page test. Parent owns messages entry, app route, preview, reading fix, integration tests and docs/Git.

Public API: `notificationManageCapabilities()` -> `{can_manage:boolean}`; `notificationManageList()` -> `{items:row[]}` latest50; `notificationManageRead(id)` -> exact row|null; `notificationManageWrite(intent)` -> `{operation,id,row?,deleted?:true}` after unique matching representation. Every real list/read/write rechecks fresh/bootstrap/server permission; write is single-send, no automatic retry. The permission RPC must bind the verified current caller ID, never input actor supplied by UI.

Helper exports `create(context,draft)`, `update(context,base,patch)`, `remove(context,base)`, `match(intent,row)`, `row(value)`, `expiry(date)`, `key(context,id)`. Context `{userId}`; intent `{operation,id,userId,base,payload}` deep-frozen. Known row shape is the11 table fields above. New payload `{title,body,active,expires_at,type:'announcement',created_by:userId}`, client frozen UUID. Update patch only title/body/active/expires_at, preserve type/category/summary/image_url/creator/created_at. Validate only changed legacy fields. Title trim nonempty max60, body trim optional max500; no silent truncation. expiry uses strict calendar YYYY-MM-DD -> Shanghai23:59:59 ISO; untouched expiry retains original precision.

PATCH/DELETE filter original known snapshot (nullable is.null, scalar raw eq.+whole parameter URI encoding), not just ID; zero rows stays unconfirmed/conflict. Old-value equality is not version/ABA protection or immutable receipt. Deleted-row absence only confirms after an exact DELETE representation. New/current content match is visible outcome, not exactly-once attribution.

## Tasks

- [x] API RED then minimal fixed-route implementation: caller token, strict entitlement intersection, latest50 stable ordering, exact projection, invalid/extra params, same-user revision/shop/scope changes, full known snapshot filters, nullable/high-precision metadata, raw scalar operands, no upsert/automatic retry, response validation and old401 isolation.54 tests after closing independent pre-transport microtask identity P2 with synchronous guards.
- [x] Page RED then native list/inline editor, explicit create/save/toggle/delete confirmation explaining global audience; title/body counters, native expiry picker/clear, active switch, preserve untouched fields. Dirty drafts are not overwritten by foreground refresh. Pending immutable intent in actor-scoped small App RAM across unload, no disk persistence; reentry first fresh capabilities then read-only reconciliation, no new create UUID until unresolved slot clears. Hide/identity clears private UI; stale dialogs/callbacks cannot act. Preview inputs active but writes/reconciliation disabled.55 tests after independent stale-toggle continuation P2 fix.
- [x] Parent employee reading RED: fetch exact ID across valid BFF pages, validate pagination/current lifecycle between pages, never show another ID, never accept missing as unrelated content; preserve full body and image_url/summary. Native detail hide clears notification UI and stale reads, foreground rechecks.11 integration tests include entry/preview/loaded-only filters/prototype category/expired badge.
- [x] Parent app route28 and messages role.manage entry (preview separately labeled), source/preview contract tests and actual GUI list/new/edit/Chinese input/expiry/disabled controls/news reading checks.
- [x] Independent cross-review closed two P2s; full1966 tests,28 routes and official29WXML/30WXSS passed. Current parity/verification updated, sourceff6b820a exact24 Mini paths pushed and remote read back; immutable notifications20261017 archive clean-extracted and reran the same checks. Normal index, Flutter/phone/data/login unchanged; no real notifications/deletions, paid AI, SMS or Lovable budget bypass. This completes only the documented notification subset, not the full active goal.

## Acceptance Gaps Remain

Dedicated employee AppID/WeChat release, real employees/camera/media, atomic ERP/RLS management alignment, real table GRANT/CRUD, full composer/identity-isolated local drafts/HTML image editor/crop/upload/AI authorization and all other parity gaps remain explicit. No subset completion may be reported as full migration or live release.
