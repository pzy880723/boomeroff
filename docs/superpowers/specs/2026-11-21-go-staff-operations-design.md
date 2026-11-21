# BOOMER GO Staff Operations

Approved direction: 2026-11-21, Asia/Shanghai.

This supersedes the recognition destination and Lovable export/coordination
requirements of the November 15 foundation design. Do not contact Lovable or
add a Lovable runtime dependency. Preserve historical data and the old app;
do not delete a source database as part of this release.

## Product

Native WeChat/Donut employee app, initially prioritizing WeChat. Destinations:
workbench, learning, competition, messages, profile. Workbench contains store,
shift, daily operational tasks, read-only sales and outstanding learning work.
Recognition is removed from the new employee flow. Marketing image/copy/video
production is not part of the new staff workbench.

Daily tasks mean real store work: fixed daily and ad-hoc instructions, owner,
deadline, photo evidence, progress, completion checkbox, manager follow-up and
employee-initiated group sharing. Photo upload must finish before completion.
Incomplete uploads never count. Share cards contain progress, not credentials
or unrestricted photo URLs; detailed views require employee authorization.

Keep training, knowledge, exams, explicit-rule performance reviews, scheduling,
notifications and existing store competitions. Sales are informational, not
automatically performance scores. No five-day scheduling business limit.
Web and Mini Program competition views must share the original event ledger,
period rules and correction history. Missing reports are not zero.

## Identity And Ownership

ERP owns passwords, SMS, employees, roles and store authorization. Never copy
passwords or create GO accounts. Every new operational API verifies the actual
ERP token/device and reads current allowed locations server-side. An unknown,
revoked or unavailable identity fails closed. Store IDs supplied by the client
are selectors, never authorization. Store staff cannot expand their scope.

New operational tasks/evidence have a dedicated Tencent service and private
storage. SQLite is the initial single-writer task ledger, not a financial or
identity database. Existing business modules keep their authoritative ledgers;
do not migrate them by duplicating records or inventing ID/name mappings.

## First Independently Deployable Slice

Create `services/go-operations` with Python standard-library HTTP, SQLite,
the existing Pillow decoder for bounded full-image validation, and
private evidence files. ERP `/handheld/auth/me` plus `/handheld/locations`
verify caller and scope on every protected request. The service does not
receive login passwords or SMS codes. Reuse the tested client ERP auth adapter.

Provide session/scope readback, date-scoped tasks, manager task creation,
authorized task details, validated photo uploads and reads, and versioned
completion with transactional audit. No public media alias. New authenticated
routes use a distinct `/go-operations/` prefix, never overwrite old routes.
No production sample tasks, accounts, photos or messages are created.

First slice is backend infrastructure, not completion of all product modules.
Before client cutover, implement the native task views, ERP session lifecycle,
learning/scheduling/message replacements and competition bridge. Disable old
runtime only after real-device acceptance with legacy hosts unreachable.

## Acceptance

- Tests deny anonymous access, cross-store task/photo access, unauthorized
  creation, expired/revoked identity and unavailable ERP.
- Photo magic/type/size verified; failed/insufficient upload cannot complete.
- Version conflicts cannot overwrite changes. Duplicate completion is safe;
  audit actor comes from ERP, never request body.
- Tencent release has isolated user, loopback listener, private state, systemd
  hardening, candidate verification and rollback; shared ERP remains healthy.
- Public HTTPS health and anonymous rejection verified separately from actual
  employee acceptance. Do not call these tests proof of successful real login.
- Whole-product completion additionally requires legacy data reconciliation,
  fixed daily scheduling, manager follow-up, native UI, group-share acceptance,
  backups/restore, ERP password/SMS acceptance and unchanged competition web.
