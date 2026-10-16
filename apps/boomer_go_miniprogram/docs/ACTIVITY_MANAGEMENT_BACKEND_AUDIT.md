# Activity Management Candidate Audit

2026-10-16. This is an audit of an unfinished backend candidate, not deployment acceptance. Native employee scope, five tabs and sales-versus-assessment boundaries remain unchanged.

## Authoritative State

- Correct GO Lovable project: `bef32724-503e-467a-af03-2062176cf921`; R36 handle `umsg_01m51fc0a2e9y8kwyc6q9hytde`.
- `get_message.response.status` is `awaiting_input`, with no tool-approval params. A read-only editor inspection showed the actual credit check-in:20.3 used, next check-in after another20, "Don't ask again" off. Parent did not click Continue/Finish up, change that switch, start a replacement request or bypass the pause.
- A concise asynchronous human budget question was sent. No human answer has been received at this checkpoint. This is a spending decision, not a request to relay engineering instructions to Lovable.
- `get_project` reports ready/agentFinished:true at fixed candidate `a4d6edb0d26775242ab23b363f9d9d62eb6f7976`; this does not supersede the message's awaiting_input state or prove the requested work finished.
- Candidate contains `actmanage.ts`, migration0027, handler/SQL tests, catalog evidence and generated migration/type artifacts. `index.ts` is unchanged and does not register `activityManageActions`; there is no final test/deployment report. Do not claim six live Edge actions from module-local registration or an applied-source file.
- Catalog evidence files are `docs/audit/r35-activity-catalog.md` and `.sql` in that backend ref. Parent read the metadata artifact, not live catalog/business rows.

## Fixed Source Fingerprints

SHA256 values below are raw UTF-8 backend source, not an opaque deployment package hash.

| Backend File | SHA256 |
| --- | --- |
| `supabase/functions/go-mini-api/actmanage.ts` | `c1efb5ed4bedcc777d4391bd40860fc951608243e36fd34b197b0d7f0b571a8c` |
| `tests/go-mini-activity-manage.test.ts` | `b5aa6140c33b6f9913772070adad238959674ed48815c8e33d1b8fb5bd1edcff` |
| `supabase/functions/go-mini-api/index.ts` | `14abc3691fc1bfa86cf1ebf796b03121ff24e061ce6183ba4efeca0b3bf554ee` |
| `drizzle/migrations/0027_go_activity_manage_native.sql` | `519a5ad1ebce2bb4da4eee2ee29e77418522d812e719357a8ac55eef818d461b` |
| `drizzle/migrations/0006_erp_scope_fresh_v1.sql` | `ee3d620f96f8bebd84ad8c647491911397ace7acc0de4ee8b4734d50f2ea54ed` |

The two SQL sources have no terminal LF. `apply_patch` audit copies in `/private/tmp/go-mini-r36-audit` add one terminal LF; their whole-file hashes differ. Original raw hashes above were recomputed excluding only that known extra byte. No other source rewriting was used for the original reproductions.

## Confirmed P2 Findings

### Unknown Field Metadata Can Be Omitted

`0027` lines104-106 checks unknown keys by iterating only the new field. For a retained stable key, removing an old unknown key is not visited and is accepted. The later activity UPDATE replaces the full array, losing the omitted metadata.

```json
{"old":[{"key":"test","label":"旧名称","type":"text","future_metadata":{"retained":true},"legacy_rank":9}],"new":[{"key":"test","label":"新名称","type":"text"}]}
```

Parent installed only the exact immutable `private.go_am_check_fields` function into a fresh in-memory PGlite database. Four probes: preserving metadata while editing label accepted; changing unknown metadata rejected; explicitly removing the whole field accepted; omitting unknown metadata incorrectly accepted. The contract assertion exits1. Independent reviewer reran the actual probe and confirmed the same unique failure.

Minimal proposed guard, only tested in local memory:

```sql
IF o IS NOT NULL AND (o - known) IS DISTINCT FROM (e - known) THEN
  RAISE EXCEPTION 'invalid_form_fields';
END IF;
```

Placed before the existing new-key loop, all four probes pass. This is not a backend source change or a deployed fix. Explicit whole-field removal remains allowed.

### Elapsed Lease Expiry Is Not Detected

`0006` uses transaction-start `now()` for the lease bound. `0027.private.go_am_gate` calls that helper again after waiting, but does not add a wall-clock lease check. Source repetition alone therefore cannot detect a lease that expires during the transaction.

Parent loaded the exact0006 freshness function and0027 gate into fresh in-memory PGlite, with synthetic auth/store/permission/active dependencies and a60-second configuration whose global enabled toggle is false. One synthetic link begins59seconds old. After1600ms in the same transaction, the actual global helper remains true, wall freshness is false and the actual gate still returns the actor. The expected gate rejection is RED/exit1. Independent reviewer reproduced this too.

The local proposed gate adds an independent `clock_timestamp()` bound using the same link_status/revoked_at/seconds/default60 conditions; it does not change the global helper or reinterpret its enabled-toggle semantics. The same elapsed-time probe then rejects with `erp_scope_not_ready` and exits0. This is a single-connection timing test, not a row-lock collision, concurrent revocation test or production repair.

## Reproducible Local Evidence

Audit runtime: Node22.23.2; temporary-only pinned `@electric-sql/pglite@0.5.10`, npm integrity `sha512-tXc/25U3ulOkiRQuTFdwIv+JhBqtMdAF7Gvo6CfZZWtSB4+hgC4Wr2vwK5ngvvN5PJfAAEGIsfyCVy1JhCOBYw==`. Installed with ignore-scripts in the audit directory, not as a Mini Program dependency.

```sh
node /private/tmp/go-mini-r36-audit/replay-tests.cjs
node /private/tmp/go-mini-r36-audit/check-fields-repro.cjs
node /private/tmp/go-mini-r36-audit/lease-wall-repro.cjs
node /private/tmp/go-mini-r36-audit/check-fields-repro.cjs --proposed-fix
node /private/tmp/go-mini-r36-audit/lease-wall-repro.cjs --proposed-fix
```

- Original actual Edge handler tests:9/9 pass under Node TypeScript stripping, original shop/error code and mock RPC only. The unused evidence dependency throws if called. This is not Deno or SQL execution and does not register the action in the real BFF.
- Original SQL reproductions: two expected RED processes. Proposed local-memory guards: both GREEN. The proposed flags modify only the loaded function definition in fresh test memory, never the audited source or remote database.
- No production connection, employee/customer rows, real activity/claim deletion, SMS, OTP or paid AI was used. No concurrent-authorization failure is inferred solely from the gate's STABLE declaration.

## Next Integration Gate

After explicit credit continuation, communicate these exact findings to the same R36 backend owner, require real RED/GREEN source fixes plus registration, full regression, migration/deployment and a final fixed SHA. Then independently review and align the native page/DTO before opening a production entry. Do not restart a paused task just to avoid its budget decision. Frontend development and synthetic read-only previews may continue, but are not proof of live activity maintenance.
