# BOOMER GO Donut And Tencent Design

Date: 2026-11-15

## Confirmed Direction

2026-11-21 update: the owner supplied employee AppID `wx5c4f68873d7f919c` and
asked to record its connection. It is now the project configuration value.
Its server-only credential is stored outside the repository with restrictive
permissions; no secret value belongs in this document, Git or client code.
Do not infer verified ownership/Donut binding from a supplied AppID alone.
The owner prioritizes the Mini Program now and defers iOS/Android packaging;
retain official Donut architecture and leave the old native apps alone.

The owner confirmed continued development of the existing native WeChat Mini
Program using WeChat's official multi-platform framework (Donut). The same
WXML/WXSS/JavaScript business application will target WeChat, Android and iOS.
Do not replace it with Taro, React Native, uni-app or a website wrapper. Do not
modify, delete or attempt to finish the old Flutter/Capacitor applications.

Retain the approved five destinations: workbench, learning, recognition,
messages and profile. This infrastructure work does not redesign their UI.

The eventual backend, identity, database, files, APIs, jobs, workers and
callbacks must run independently on Tencent Cloud, without Lovable runtime
dependencies. Self-hosted open-source Supabase components are compatible with
this requirement; they are not Lovable hosting.

The owner's later clarification is authoritative: ERP is the sole employee
account/password database, and both password and SMS-code login must use ERP.
Do not create a separate GO Auth realm or synchronize/copy passwords. Old GO
author IDs remain historical migration references, not another login identity.

## Verified Starting Point

- Repository: `pzy880723/boomeroff`; Mini Program delivery baseline is
  `codex/go-mini-workbench` at `b1a282f7627de4fd7687ab9242772aa03016ff0b`.
- Client source: `apps/boomer_go_miniprogram/miniprogram`.
- Baseline verification today: 1966 tests passed, no failures/skips.
- At the 2026-11-15 baseline, `project.config.json` used `touristappid` and no
  `project.miniapp.json` existed. The November 21 update above supersedes the
  AppID value, not the unverified Donut binding/release state.
- Installed WeChat DevTools: `2.02.2609250`. Codex CLI authorization completed;
  status reports an unexpired login and matching skill version. Imported GO
  used a tourist AppID at that checkpoint; current registration is above.
- Current client config targets GO Lovable Cloud
  `narqwgwpqglathwtyevz.supabase.co`; ERP URL is `erp.boomeroff.com`.
- Source-side `get_database_status` confirms this GO database is enabled.
- The old backup guide describes business-table JSON and Storage mirrors in
  COS, explicitly excluding Auth system tables. Its schedules/completeness
  are historical documentation, not a verified current restorable backup.
- Existing source API contracts include caller JWT, RLS, RPC, fresh ERP scope,
  Storage signatures, immutable attempts and mutation receipts. Moving only
  the PostgreSQL address would not preserve these contracts.

## Architecture

Keep the current native client and preserve business behavior while changing
identity/API contracts coherently to ERP. Donut
configuration must be generated/validated using the official developer tools
after the correct employee Mini Program and multi-platform app are bound.
Never borrow the consumer Mini Program's AppID or invent SDK/project fields.
Camera, media saving, scanner, notifications, clipboard, file previews and
privacy behavior require independent WeChat/iOS/Android acceptance.

Use Tencent-owned HTTPS entry points for client APIs and media. ERP is the
only active employee identity/password/SMS authority. Preserve old GO business
references through verified mappings to ERP employee IDs; missing/ambiguous
mappings require explicit reconciliation, not guessed identity replacement.
Never turn profile names/phone strings into authorization. GO storage must not
create another writable financial ledger or another active password database.
Existing ERP production is not modified by this client foundation work.

An independent target needs a coherent restored schema/roles/RLS/RPC/Auth,
files, server functions, Realtime, scheduled jobs and workers. Audit the shared
AIGC/GO functions and callback issuers before moving any shared component.
Each business entity has one active writer during cutover; no blind dual-write.

## First Implementation Slice

First implement a native JavaScript ERP password/SMS adapter using the existing
ERP routes and independent `/auth/me` identity readback. Do not activate it in
the App until the Tencent business API accepts ERP identities. The current GO
session bridge still verifies old GO tokens, so changing login URLs alone is
not a complete integration. Future storage must isolate old GO credentials.

ERP source contracts inspected: password bootstrap
`/api/public/handheld/auth/bootstrap`, SMS `/api/public/auth/otp/send` and
`/api/public/auth/otp/verify`, identity `/api/public/handheld/auth/me`.
Both login methods return the same ERP identity model. Only the caller's
actual ERP permissions may authorize operations. Source inspection is not
authenticated runtime acceptance. A current read-only aggregate found three
active identity mappings, with distinct ERP/GO IDs; full author coverage is
not established. Existing GO records require verified mapping to ERP IDs.

The inspected ERP OTP source still performs separate code lookup/attempt/
consumption updates and searches only the first 200 Auth users. Before live
activation, verify the actual deployed revision and close atomic-consumption,
concurrent-attempt and directory-coverage gaps in the shared ERP service.
Do not turn a synthetic client test into evidence that those server concerns
are fixed. No real SMS has been sent during this work.

## Execution And Acceptance Gates

1. Complete and test the ERP password/SMS adapter. This proves synthetic
   request/identity-readback behavior only, not real login or Donut builds.
2. Obtain official source-export capability and a restorable snapshot, including
   confirmed historical identity coverage, business relations, policies/functions and file
   manifests. A read-only planning request has been sent directly to Lovable:
   `umsg_01m7een0tqfv1s63aaby2g9wxx`, thread `main`. Do not treat the request as
   an export, nor use paginated JSON as a substitute for schema/relationship
   migration. Do not import old GO credentials into a second active Auth realm.
3. Revalidate Tencent capacity and current service ownership, then restore in
   an isolated GO candidate. Verify counts, relationships, file hashes,
   ERP identity/store authorization, issuer configuration and revocation. Never
   repoint the active ERP cluster or experiment on production data.
4. Register/bind the employee Donut project and pin official SDK versions.
   Compile the same client for WeChat, Android and iOS. Camera/media privacy,
   signing, actual installation and device acceptance are separate gates.
5. Exercise genuine employee login, own-store access, knowledge/quiz save,
   schedule read/write, continuous recognition, messages and video/cover/copy
   delivery. Store staff cannot gain cross-store access; HQ selection remains
   limited to backend-authorized shops.
6. Reconcile final source deltas and perform controlled writer cutover. Test
   that normal operations still work with Lovable endpoints blocked. Verify
   Tencent backup restore and monitoring, not merely HTTP 200 or a build.

Keep the source and target snapshots and an exact release/version record.
After target writes start, reverting a URL alone is not a safe rollback:
stop/fence the writer and reconcile target-only changes before returning traffic.
Do not delete or revoke the old environment during this initial slice.

## Sources

- Official framework overview:
  https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/miniapp/intro/intro.html
- Official Tencent integration and platform setup links:
  https://cloud.tencent.com/document/product/269/111208
- Self-hosting responsibilities:
  https://supabase.com/docs/guides/self-hosting

No claim of Tencent migration, three-platform compilation or real employee
acceptance is made by this design or the first implementation slice.

## Initial Verification Record

The ERP adapter's 16 synthetic tests pass. A full local run passed 1982 tests
with zero failures/skips, and the native checker passed all 28 routes. These
checks cover source behavior only; the adapter remains inactive in the App.
Official DevTools listed a tourist employee project at the baseline. The owner
subsequently provided the dedicated employee ID; it is not the consumer ID.
