# BOOMER GO Operations

Independent Tencent service for the approved staff product. It uses the server's
existing Pillow decoder, no password database, no GO Auth realm and no Lovable
calls. ERP is the sole identity and current store-scope authority. The old Mini
Program is not switched by deploying this service.

## Run And Test

```sh
python3 -m unittest discover -s tests -v
GO_OPERATIONS_STATE=/private/tmp/go-operations-local PORT=3987 python3 server.py
```

Python 3.12 is the production runtime. New operational tasks use ERP location
IDs directly, not names or historical GO shop IDs. Existing knowledge,
schedules, exams and competitions are NOT silently copied into this ledger.

## API

New client prefix: `https://go.boomeroff.com/go-operations/`. Keep the existing
`ai.boomeroff.com` prefix active for previously uploaded clients until their
replacement is verified. ERP authentication stays at `erp.boomeroff.com`.
All responses have `Cache-Control: no-store`. Every protected request requires
both the real ERP `Authorization: Bearer ...` and `X-Device-Token`; they are
forwarded only to fixed ERP HTTPS endpoints, never persisted or logged.

- `GET /healthz`: service/database readiness, no employee data.
- `GET /v1/session`: ERP user/roles/current authorized active shop locations.
- `GET /v1/tasks?shop_id=<ERP-location-id>&date=YYYY-MM-DD`: scoped tasks and counts.
- `POST /v1/tasks`: manager creation with `shop_id,date,title,description,required_photos`.
- `GET /v1/tasks/<id>`: task and evidence metadata, no public file paths.
- `POST /v1/tasks/<id>/photos`: JPEG/PNG/WebP binary, maximum 6 MiB;
  MIME and file signature must agree; images must fully decode, be single-frame
  and have at most 12 million pixels. Duplicate bytes do not count twice.
- `GET /v1/photos/<id>`: authenticated, store-scoped private evidence bytes.
- `POST /v1/tasks/<id>/complete`: `expected_version` and optional `note`;
  all required evidence must exist and match its stored hash.
- `GET /v1/tasks/<id>/audit`: store-scoped managers only.

Managers are ERP `store_manager` or `super_admin`, still constrained to the ERP
locations response. `hq_operator` has no inferred task-write permission. ERP
unavailability fails closed; no stale permission cache. Client-selected IDs,
profile names, phone numbers and claimed roles are never authorization.

## Deployment And Rollback

Use a versioned root-owned release under `/srv/boomer-go-operations/releases`.
Run tests before switching `current`; preserve the previous target. The service
runs as its own non-login user on loopback port 3987. Only its private state
directory is writable. Never expose state/media through an Nginx alias.

Install the systemd unit, check loopback health and anonymous rejection, then
add only the supplied Nginx location inside the existing HTTPS server. Back up
the exact active Nginx file first; validate with `nginx -t` before reload. Do
not modify ERP routing, existing Supabase proxies or the battle service.

For the dedicated GO host, provision a public `go` A record to the existing
Tencent ingress. Install `deploy/go.boomeroff.com.http.conf` first with the
ACME webroot `/var/www/boomer-go-acme`; issue the Go-only certificate before
enabling `deploy/go.boomeroff.com.https.conf`. Install
`deploy/nginx.location.conf` at `/etc/nginx/snippets/boomer-go-operations.conf`.
Verify the new hostname with trusted TLS, HTTP 200 at `/go-operations/healthz`
and HTTP 401 for unauthenticated `/go-operations/v1/session` before uploading
the updated client. The employee Mini Program request allowlist needs the
new GO host and the unchanged ERP host.

Rollback code by pointing `current` back to its recorded previous release and
restarting only `boomer-go-operations`; remove only the new Nginx location if
rolling back the first installation. Do not restore an old database over new
task writes. This initial schema is additive and needs no ERP migration.

## Backup And Release Gates

State is `/srv/boomer-go-operations/state`: SQLite DB/WAL plus private `photos/`.
Before accepting real employee writes, install and verify a consistent backup:
stop only this service, archive the complete state with permissions intact,
restart and test an isolated restore with SQLite `quick_check` and all photo
hashes. Never back up a live SQLite main file alone or place archives in a
public web root. Off-machine backup and a retention policy are still required.

The initial deployed unit explicitly sets `GO_OPERATIONS_READ_ONLY=1`; health
reports this state. Authenticated reads work, but mutations return
`release_read_only` until backup/restore and client acceptance pass. Local tests
exercise the full write flow against disposable data, never employee records.

## Outstanding Product Acceptance

This slice is backend foundation, not the completed staff product. Required
before real staff rollout: ERP real password/SMS acceptance, Mini session
refresh/revocation, employee-only current-store policy, native task UI,
fixed-daily assignment/owners/deadlines, follow-up/return-to-work, employee group
sharing, knowledge/training/exams/scheduling/messages migration, historical
content/media reconciliation, original competition web+Mini shared authority,
backup restore and device acceptance. No sample business records are seeded.
