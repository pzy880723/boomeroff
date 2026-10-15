# Native Voucher and Activity Operations Plan

**Goal:** Migrate employee voucher lookup/redemption and permission-gated activity publication confirmation into native WeChat pages, retaining the five approved tabs and existing account authority.

**Architecture:** Native pages use the existing authenticated GO BFF. The backend owns scope, eligibility, time, state transitions and receipts. No employee receives new table grants, RLS policies or roles. Existing GO Web/Edge behavior remains unchanged unless a separately reviewed compatibility fix is necessary; its known risks are not represented as repaired by the new native path.

**Tech Stack:** Native WXML/WXSS/CommonJS, Node test runner, existing Lovable Cloud Postgres/Edge Functions, official WeChat DevTools.

## Evidence and Design

- Read-only baseline: GO Lovable `8ca1721ba933baf0b5367c530e30093cb3720d2e` plus catalog definitions reported by Lovable; no real claims, applications, employee records or files were read.
- Existing `voucher-redeem` uses a service client, SELECT followed by unconditional UPDATE, no store/fresh-scope check and no positive claimed-state predicate. Do not call it from the new native page.
- Existing claim SELECT/UPDATE RLS is manager-only. Do not add redeem-only table access to make an invoker query work. A narrowly guarded privileged transaction for the already-authorized redeem operation is justified; revoke PUBLIC/anon execution, fix search_path, take identity only from auth.uid(), revalidate fresh ERP and exact selected store inside that boundary.
- Claims and activities derive store through `voucher_id -> vouchers.shop_id`; missing store is not global authority. Reject NULL store and out-of-scope/other selected store without revealing private records.
- Web QR payload is an approved public origin followed by `/me/vouchers/redeem/<8 ASCII alphanumeric characters>`. Native initially accepts the verified `https://ai.boomeroff.com` origin and bare 8-character codes; `/u/c/...`, template UUIDs, other origins and malformed paths are not redeem codes. Never navigate to the scanned URL.
- Existing activity publication confirmation changes six publish fields, not application review, voucher issuance, social-platform posting or redemption. Ordinary staff and redeem-only users must not receive application PII or evidence.
- Figma file `SXY4nF6NWwrsw3jxZOIaDU`: frame `6:2` voucher lookup/explicit confirmation, frame `6:3` activity publication confirmation. Both rendered and inspected. Existing red/white typography and spacing retained; all data in designs is explicitly synthetic.

## Step 1: Voucher Closed Loop and Store-Safe Reads

- [x] Audit Web/native routes, code formats, RPC/Edge source and live catalog authorization without reading business data.
- [x] Create and inspect editable native design frames.
- [x] Obtain deployed voucher capabilities/lookup/redeem/status DTOs from Lovable and read their fixed source/migration refs.
- [x] Require current selected shop in the BFF and inside the transaction. Lookup may use existing redeem OR manage authority; mutation requires redeem. Manager-only must not become a redeemer.
- [x] Keep a caller/request/payload-bound receipt committed atomically with the claimed-to-redeemed transition. Cross-payload reuse conflicts. Replays still require current authority. A read-only status lookup distinguishes this request's success from another actor/request.
- [x] Inspect the SQL test source and Lovable's 12-group rolled-back synthetic verification report: own store, other store, NULL store, no authority, stale/revoked scope, disabled account, expiry equality, unclaimed/void/redeemed, inactive/deleted/not-started template, same-key replay/conflict and atomic update receipt. Main did not rerun SQL; no real redemption or SMS, no two-session concurrency claim.
- [x] Write failing native parser and page tests before implementation. Scan only queries; confirmation is an explicit modal. Unknown write result preserves frozen payload/key and offers read-only reconciliation, not an automatic mutation retry.
- [x] Add native route and a clearly named redemption entry without confusing voucher templates with claimed customer instances. Preserve template browsing and don't relabel it a personal wallet.
- [x] Preserve user/shop/scope/revision, visibility and picker lifecycle isolation; clear stale sensitive state. Never display raw recipient name/phone when the DTO supplies masked fields.
- [x] Filter the existing mini activities/vouchers list/detail handlers by exact selected authorized store. No broad legacy RLS fallback; NULL store is unavailable, not global.

Round13 fixed source: `a4b3eb9f99aa13d0672a20df5e9be0718ddcea47`. Independent backend source review found no confirmed new P1/P2. Lovable withdrew the two irreproducible Round13/14 deployment fingerprints; main independently recomputed fixed-source hashes, not online-bundle hashes. Exact deployed bundle alignment remains unproven. The new anonymous action returned 401. Native focused tests were rerun 48/48, and actual DevTools showed the labeled read-only DEMO1234 amount, rules and masked recipient. A reviewer-found unload/403 recovery gap was repaired using minimal account/store-isolated App RAM, not disk; a second first-abort deadlock was repaired without releasing historical unknown requests. Independent post-fix review confirmed both closed and found no confirmed new P1/P2. Whole native suite 414/414, official 18 WXML/19 WXSS and 17-route checks passed; activity-specific acceptance remains separate below.

## Step 2: Activity Publication Confirmation

- [ ] Obtain the accurate native management DTO and private evidence binding/upload contract before implementation. Do not guess existing endpoint names or reuse the global definer list as the native scoped API.
- [ ] Basic detail and paginated applications remain distinct. Only same-store manage authority may read applications, submitted fields and evidence.
- [ ] Server supplies confirmation actor/time and an opaque version. Confirmation/false cancellation is a fixed target, not toggle; compare the expected version and return conflicts instead of overwriting another manager's changes.
- [ ] Preserve all existing screenshot paths even if signing fails. Only add newly uploaded paths bound to this application. No arbitrary-path signing or permanent/public URL.
- [ ] Keep Web limits of trimmed note <=200 and URL <=500; no external fetch/navigation of user URLs. Do not invent a requirement for a link/image, restrict to approved application status or treat a paused activity as a void coupon without an existing business rule.
- [ ] Match application/activity/store/target/version and persisted receipt before closing the editor; read back current state. Failed or unknown writes keep drafts and stable intent.
- [ ] Use native image picking/preview and original private uploads after fresh authority. No Web forms, H5 preview or imported screenshots as UI.

## Integration and Acceptance

- [x] Run voucher/schedule focused tests and the complete native suite, static route/security checks and all WXML/WXSS official compilers: 414/414, 17 routes, 18 WXML and 19 WXSS.
- [x] Inspect actual read-only native voucher lookup and schedule month/rest/empty states; retain screenshots outside the hot-reload source root. Mutation/rejection races are simulated tests, not real employee GUI acceptance.
- [ ] Inspect native activity detail/publication editor and perform their focused/full tests after Step 2 is implemented.
- [ ] Refresh FEATURE_PARITY and VERIFICATION with fixed backend refs, evidence scope and remaining old-path risks; push only mini-program files on `codex/go-mini-workbench` using the isolated index.
- [ ] Dedicated-AppID/device acceptance with authorized employees is separate from synthetic tests, compiled source, migration application or screenshots. Do not claim real redemption, review, publication or phone acceptance from any of those.
