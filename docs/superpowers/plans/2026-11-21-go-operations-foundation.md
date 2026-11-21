# GO Operations Foundation Implementation Plan

> **For agentic workers:** Use executing-plans to implement the isolated service task-by-task. Do not change the shared ERP application or old native app.

**Goal:** Deploy a Tencent-only, ERP-authorized operational task/evidence service without redirecting the unfinished legacy client.

**Architecture:** The private service delegates identity and current location scope to ERP on every protected request. Task records, audit and media live in private Tencent state. All new routes have a distinct prefix; no legacy writer is switched.

**Tech Stack:** Python 3.12 standard library, SQLite, existing Pillow decoder, systemd and Nginx/TLS.

## Task 1: Authorization And Store Boundary

Files: `services/go-operations/erp.py`, `tests/test_operations.py`.

- [x] Add tests for ERP token/device forwarding, identity/role/scope readback,
  missing credentials, unauthorized location and upstream outage.
- [x] Run `python3 -m unittest discover -s tests -v`; observe missing behavior.
- [x] Implement fixed-origin HTTPS ERP calls with explicit timeouts, no redirect
  following, no persisted tokens and fail-closed current scope.
- [x] Rerun focused tests and verify no credentials appear in test output.

## Task 2: Task And Evidence Ledger

Files: `store.py`, `tests/test_operations.py`.

- [x] Test manager-only creation, date validation, cross-store reads/uploads,
  allowed photo signatures and size, insufficient evidence and version conflicts.
- [x] Implement transactional SQLite records/audit and atomic private evidence
  files. Use ERP actor, current shop scope and CAS version for completion.
- [x] Rerun tests, including close/reopen persistence and forbidden photo reads.

## Task 3: HTTP Boundary

Files: `server.py`, `tests/test_operations.py`.

- [x] Exercise a real loopback HTTP server using synthetic ERP authorization:
  health, anonymous denial, scoped creation/upload/completion and JSON errors.
- [x] Implement finite body limits, JSON validation, binary media transport,
  fixed routes, no-store/nosniff headers and bounded concurrency.
- [x] Verify malformed/missing/unknown routes never expose state or raw errors.

## Task 4: Tencent Candidate And Release

Files: `deploy/boomer-go-operations.service`, `deploy/nginx.location.conf`,
`README.md`, `docs/boomer-go-native/TENCENT-OPERATIONS-2026-11-21.md`.

## Execution Record

2026-11-21: authorization, task/evidence persistence and HTTP boundary are
implemented and tested locally/on Tencent (13 tests each). Versioned candidate
`20261121-2` and the isolated HTTPS prefix are deployed; anonymous/invalid
credentials are denied and existing ERP/battle entrypoints remain healthy.
Writes remain disabled. This does not satisfy real identity/client/data
migration or backup/device acceptance; see the verification record above.

- [x] Package source only, run tests on Tencent Python, create dedicated service
  account, private state and a versioned release; preserve prior current link.
- [x] Start loopback candidate on a free port and check health/anonymous denial.
- [x] Add only the distinct Nginx prefix with an exact config backup; run nginx
  config test before reload. Never edit old Supabase routes or ERP upstream.
- [x] Verify public HTTPS health, anonymous denial and old ERP/battle entrypoints.
- [x] Document release version, state location, rollback, backup/restore and
  outstanding client/data-migration acceptance. Do not claim full migration.
