# Tencent Operations Foundation Verification

Date: 2026-11-21, Asia/Shanghai. This is a backend candidate, not a completed
employee Mini Program migration or an authenticated production acceptance run.

## Approved Direction

- No Lovable runtime, deployment or coordination dependency in the new product.
- ERP employee password/SMS identity and authoritative location permissions.
- Native WeChat/Donut workbench, learning, competition, messages, profile.
- Daily store work uses photo evidence and completion, not experience claims.
- Preserve history, old ERP and the existing competition web ledger.

## Actually Deployed

- Service: `boomer-go-operations`; dedicated non-login user.
- Code: `/srv/boomer-go-operations/releases/20261121-2`.
- Current link points to that release; initial v1 retained for rollback.
- HTTPS prefix: `https://ai.boomeroff.com/go-operations/`.
- Loopback only: `127.0.0.1:3987`; private state mode 0700, SQLite mode 0600.
- ProtectSystem=strict, NoNewPrivileges=yes, MemoryMax=192 MiB.
- Health HTTP 200: version `2026.11.21.2`, `read_only: true`.
- Anonymous session HTTP 401; deliberately invalid ERP/device credentials also
  HTTP 401. No real employee password or SMS was used or sent.
- Nginx config test passed, reload succeeded. Original config preserved at
  `/etc/nginx/ai.boomeroff.com.before-go-operations-20261121`.
- ERP `/login` remained HTTP 200, battle `/healthz` remained HTTP 200.
- Local/Tencent package SHA256 matched:
  `2287a0789e8c76c9c66cd30714a37f38faee041360a386e3d0cfcbb1e5dcdc1a`.

## Verification

- New service: 13 local and 13 Tencent tests passed, including real loopback
  HTTP using synthetic ERP identities, persistence, photo decoding/integrity,
  cross-store denial, insufficient evidence, conflict, idempotent completion,
  missing-file recovery, 501-task listing and the read-only release gate.
- Existing Mini Program: 1984 tests passed, zero failures/skips; 28-route native
  syntax/JSON/no-H5/no-server-secret checker passed. These tests do not prove a
  new Mini UI or real ERP login works.
- Independent code review found four defects in the initial candidate; fixed
  them before public-prefix exposure. Re-review found no release-blocking issue
  for the stated read-only candidate. This is not a full penetration test.
- Existing server Pillow 10.2.0 performs bounded image decode. Only one decode
  runs at a time; accepted connections are capped before thread creation and
  have an absolute lifetime bound. JPEG/PNG/WebP only, at most 12 MP.

## Not Yet Delivered

The current Mini Program still uses its original transport/session and legacy
media URLs. Do not repoint it merely because this health check passes.

1. Integrate ERP session refresh/revocation and server-owned employee current
   store policy, then genuine password/SMS/device acceptance.
2. Implement approved native navigation and operational tasks UI, recurring
   daily assignments, owners/deadlines, progress drafts, manager return/follow-up
   and employee-initiated group sharing.
3. Migrate knowledge/training/exams, schedule, messages and explicit appraisal
   contracts to Tencent. Preserve real content IDs and ownership/history.
4. Adapt original battle service to ERP scope and a native competition view;
   keep one event ledger and the original working website.
5. Reconcile media/history from authorized existing artifacts without contacting
   Lovable; validate backup/restore, monitoring, capacity and client allowlists.
6. Real-device acceptance with legacy endpoints unavailable, then controlled
   writer/client cutover. Only then remove remaining legacy proxy dependence.

No business sample records were seeded. Writes intentionally remain disabled.
Root disk is 95% used (about 10 GiB free); no unrelated data was deleted.
