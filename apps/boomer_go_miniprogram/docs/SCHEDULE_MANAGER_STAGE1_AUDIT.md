# Schedule Manager Stage1 Source Audit

2026-10-16. This is not authenticated employee acceptance. Native management calls remain unwired. The separate R27 content-home plan has not been approved or implemented.

## Fixed Source

GO Lovable final R28 commit: `1e35a5984139025cbc6b2e91619d977060dca229`. Main workflow independently read the final migration, Edge module/index, tests and contract through the GO connector. The following SHA-256 values were independently recomputed from the exact returned source, excluding the extra final LF introduced only by local audit snapshots:

| File | SHA-256 |
| --- | --- |
| drizzle/migrations/0023_go_schedule_manage_native.sql | 9bf34170b7ee7ecef4f9ed39d9d592f6720c8ad22b9a886304bdf741473ab38e |
| supabase/functions/go-mini-api/schedmanage.ts | 7900fa169bf4cbd023dc623192879bbe55a1eab208d37cfd6a952f6b7588d687 |
| supabase/functions/go-mini-api/index.ts | b578784478beb56b434eec09884a7e38be8746992beb51dc81ec9b82d1fd2eac |
| tests/go-mini-schedule-manage.test.ts | f8f676dbf566147cf3514c29146608c4ea3a00421eccfa04af2dc78c3e06dc01 |
| tests/sql/go-schedule-manage.sql | 607059e697549036ae591166f96135e5169b89e13b66ffc61d2ede689c620d83 |

The main workflow ran the original eight Edge tests in an isolated Node built-in TypeScript-transpiled harness: 8/8 passed. Imports were redirected to the fixed local shop module and Node assertions; no business or SQL requests ran. This is not a Deno runtime or SQL concurrency result.

Lovable reports migration 0023 applied, go-mini-api deployed, 60 synthetic SQL checks rolled back with zero fixture residuals, 119 Deno tests and five quiz tests passing. Those are owner reports; the main workflow has not independently rerun the SQL or read back the deployed bundle. The reported anonymous 401 verifies denial only.

## Confirmed P2 Findings

1. Migration line 241 checks the write gate before waiting for request/cell/row locks; replay and mutation do not recheck after those waits. A concurrent revocation can therefore be missed by the SECURITY DEFINER write path. Recheck current authority after relevant waits, including before replay. Do not confuse transaction-start now() with wall-clock lease expiry.
2. Lines 266-288 lock the assignment and existing active shift rows, but do not protect staff rules, day-off changes or insertion of a duplicate shift code until mutation. Existing Web DML can change these after CAS/warning validation but before the write. Protection must cover old writers and missing-row/phantom cases, not only new advisory-lock participants.
3. Lines 130-135 allow an existing assignment to bypass candidate visibility and return private profile/day-off-derived warnings and active state. A schedule.view_shop-only reader without staff.read can infer rules the existing source-table RLS does not allow. Assignment visibility must not grant rule visibility; no additional staff.read grant is an acceptable repair.

These findings are grounded in fixed-source interleavings and existing RLS, not a real two-session database reproduction. Independent review confirmed all three; it found no additional issue in the audited non-null shop gate, read/write separation, canonical replay binding, delete status or private receipt/anonymous ACL boundaries.

## Direct Follow-Up

R29 was sent directly to the same GO Lovable project in normal build mode, message `umsg_01m515v9eefxjvcya5jmvq9nba`, thread `main`. It requests a subsequent repair migration, RED/GREEN tests, deployment, fixed SHA/full hashes and explicit concurrency limitations. Do not restart this task while it is running or treat its accepted state as a completed repair. Freeze the native DTO and wire the UI only after the final repaired source is independently verified.
