# Native Notifications

2026-10-17. This migration covers employee reading and the existing manual system-notification manager. It does not complete the separate AI/rich-composer workflow.

## Source And Audience

Fixed GO source `a4d6edb0d26775242ab23b363f9d9d62eb6f7976` was read through the GO Lovable connector, including Notifications.tsx, NotificationManager.tsx, go-mini-api and the notifications/RLS/permission migrations. This is the same GO backend, not the ERP Lovable project or a new database.

Notifications are global: the table has no shop_id or recipient-shop list. The native manager explains the global effect before create/save/enable/disable/delete. Employees retain their normal authorized reading and exact loaded-ID read-state workflow. No cross-store browsing permission is added.

## Employee Reading

The existing BFF lists active notifications in stable created_at/id order, with caller RLS and its legacy backup-type exclusion. There is no exact-ID detail action. The native reader follows valid20-row pages until it finds the exact ID or reaches the end. It validates page/page_size/has_more, row identities and repeated-page errors, and stops between pages if the view/context changes. It does not treat a page-one miss as an unrelated article, nor claim an immutable pagination snapshot.

Full body, independent summary and valid HTTPS image_url banner are retained. Native rich-text remains the existing renderer; this work does not add a browser or an external-link navigation handler. The message list has notification/news, type and explicitly loaded-only text filtering. The unread count continues to describe the whole loaded window, not merely filtered results. Unknown category names cannot inject inherited JavaScript values into setData.

Hiding notification detail clears its private visible content and invalidates the request. Foreground return reads again. A late hidden401 or stale identity result cannot apply to the new view; a current visible401 still follows the existing login handler.

## Manual Administration

- Existing current bootstrap role.manage and strict same-caller `user_has_permission(_user_id,_perm)` true are intersected after freshness validation. HQ and the old admin role are not substituted for permissions. Notifications RLS still uses the GO role matrix, so this is not atomic server-side ERP/RLS alignment.
- Fixed caller-JWT REST reads the latest50 rows or an exact ID, including inactive/expired records allowed by the existing management RLS. The projection is id,title,body,type,active,expires_at,created_by,created_at,image_url,category,summary.
- Create freezes a client UUID, sets type=announcement and created_by=current caller, and does not upsert. Edit only changes dirty title/body/active/expires_at fields. Old type/category/summary/image_url/creator/timestamp are preserved, including untouched high-precision expiry.
- Changed title is required and at most60; body is optional and at most500. Overlong drafts are retained, not truncated. A changed calendar date maps to Shanghai23:59:59; unchanged expiry is not reconstructed. Expired badges use device time for presentation only, not authorization proof.
- PATCH/DELETE condition on the known original snapshot, with null-specific filters and whole-parameter URI encoding. This is old-value equality, not version/ABA protection or a database request ledger. Unknown future columns are not part of this known snapshot.
- Unique matching mutation representation plus independent exact-ID readback precede completion. Unknown create/update content equality confirms current visible outcome, not immutable request attribution. An absent row alone never confirms unknown deletion; a matching DELETE representation is additionally required.
- Unresolved original intent lives in actor-scoped App RAM across page unload and cannot be silently resent or replaced with a new create ID. It is not persistent across process restart. Delete cascades existing notification_reads by the original FK; it does not delete image objects or accounts.

## Remaining Scope

Real authenticated employee CRUD/RLS/table GRANT acceptance, dedicated employee AppID/privacy/domain/device/release gates remain. Existing Web identity-unscoped local drafts, full rich-body editor, banner/body image selection/crop/upload, version selection and AI composition/banner generation are not yet migrated. In particular preview_only banner generation calls a paid model and uploads a public image; it is not a side-effect-free preview and was not invoked. R36's spending check-in was not bypassed or superseded.
