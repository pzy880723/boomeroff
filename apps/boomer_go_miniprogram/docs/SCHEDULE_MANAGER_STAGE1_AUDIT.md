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

## R29 Fixed-Source Review

R29 completed at fixed GO commit `d0ba9153f3a430c5b3eaf7e8f2b3e17903c770de`. Main workflow read the final source and independently recomputed:

| File | SHA-256 |
| --- | --- |
| drizzle/migrations/0024_go_schedule_manage_recheck_locks_visibility.sql | be32210b55402c551b3c405ad304438829f64b648b8291faa2a7ad55e7a0208b |
| supabase/functions/go-mini-api/schedmanage.ts | 34ea680af4a105ed30fa59c2010969ec7ab14b292967e90d126e1f2545078d17 |
| supabase/functions/go-mini-api/index.ts, unchanged | b578784478beb56b434eec09884a7e38be8746992beb51dc81ec9b82d1fd2eac |
| tests/go-mini-schedule-manage.test.ts | 779c38a49c47b639fd0ff6f7cc94de798d971a093062b94c5a7df20345dcdec7 |
| tests/sql/go-schedule-manage-r29.sql | cba0fc14f5516f20cd8e9e7ff5ec83db85a30b2b213afcc3945b2eb6a7198653 |

Main workflow independently replayed the original Edge tests in the same isolated Node-transpiled harness: 9/9. The only Edge change is strict projection of rules_visible. Independent SQL review confirms the post-request/business-lock gate and wall-clock freshness repair, and SHARE table locks for shift/day-off/role phantoms plus target-profile/actor-ERP row locks. Profile/day-off facts the caller cannot read are omitted from warnings and the v2 cell-version hash. rules_visible describes profile-rule visibility, not permission to read every possible rule source.

The original 0006 fresh helper is independent of the global enabled flag, so the suspected flag-off regression was disproved; it is not an open finding.

Owner reports migration 0024 applied and Edge redeployed, R29 SQL 18/18 after 11 RED failures, old SQL 60/60, Deno 120/120, quiz 5/5 and zero synthetic residuals. The attempted two-session test did not establish overlapping sessions and proves no concurrency interleaving. These database/deployment reports were not rerun by the main workflow; it did not download the live bundle.

## Residual P2 And R30

The unchanged private candidate predicate still reads hidden user_roles.suspended. For an actor with staff.read but no user.read, active_users membership, facts.candidate and cell.can_save can change when a visible employee's hidden suspension changes. The original Web uses caller-JWT user_roles SELECT, which is self/user.read only, so this bypass is not equivalent to Web behavior. Masking target_active alone is insufficient.

This was sent directly as R30, message `umsg_01m51702crfyrrafkat5zxtqzy`, thread main, normal build mode. Public eligibility projections must respect role-row visibility while private writes retain suspension protection; no RLS/permission widening is allowed. At this checkpoint the handle is confirmed running, not a completed fix. Keep the native manager entry unwired until the final source review closes this finding.

## R30 Closure And Native Handoff

R30 later completed at fixed ref `021a5adbe3e0146cffcae69de5a38e49fcc3949b`. Main workflow read migration 0025 and its SQL test and independently recomputed `00060e5c5c5a6caf594498fcec32b56f9b698c0e39c230f2fc77f1e0ae03d52d` and `80764d7d28a70dbcd89c62d6eff9f5f19a41e13264df61ec2b2fd05699404a07`. The complete diff from R29 changes migration/tests/docs/metadata only; Edge source is unchanged and the owner did not redeploy it again.

The new private public-candidate helper conditions suspension filtering on actual role-row visibility, and remains inaccessible to authenticated/anon callers. active_users and facts.candidate use it; cell.can_save follows that public projection. Private create/update still uses the original locked eligibility check and rejects suspended targets with generic not_found. A public can_save true is not a bypass or proof of final private eligibility.

Independent review completed 12 static assertions and 16 predicate-model combinations, closed the residual P2 and confirmed no new P1/P2. It did not run database SQL or real concurrency. Owner reports 0025 applied, R30 SQL 16/16 after five RED failures, updated old SQL 60/60, R29 SQL 18/18, Deno 120/120, quiz 5/5 and zero synthetic residuals. Two old assertions encoded the private-suspension leak and were updated for the corrected visible behavior; private write rejection remains tested.

Main workflow made two safe anonymous live probes with only existing public client configuration: Edge returned 401 unauthorized; direct go_schedule_manage_cell_v1 RPC returned 401/42501 permission denied for function. No real employee identity, record read or mutation occurred. This verifies reachability/denial, not authenticated management or deployed bundle bytes.

The fixed client DTO and native implementation plan are in SCHEDULE_MANAGER_STAGE1_NATIVE.md. Native page, read-only preview and separately authorized month-page entry are integrated and independently reviewed. A client404 recovery P2 was found, reproduced and closed without changing backend authority or treating404 as deletion proof. Parent and independent1211/1211,24-route checks and official25WXML/26WXSS compilers pass. Actual synthetic GUI candidate/editor/close/warning states were inspected. Full swap/clear/definitions/day-off/AI migration, real employee/device acceptance and the separate R27 home prerequisite remain open.
