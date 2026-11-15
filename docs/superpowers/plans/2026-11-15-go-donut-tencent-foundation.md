# GO Donut ERP Password And SMS Foundation Implementation Plan

> **For agentic workers:** Execute this scoped plan with tests and readback. Tencent data cutover, App activation and Donut builds are separate gated work.

**Goal:** Prepare one native ERP password/SMS adapter for the Mini Program and subsequent Donut Android/iOS builds.

**Architecture:** Reuse actual ERP HTTPS auth routes and ERP identity readback, not GO Auth or copied passwords. Do not activate the adapter against old GO business APIs. Old mobile apps, current runtime config and production data stay untouched.

**Tech Stack:** Native Mini Program JavaScript and Node test runner.

---

## Files

- Create `apps/boomer_go_miniprogram/miniprogram/shared/erp-auth.js`.
- Create `apps/boomer_go_miniprogram/tests/erp-auth.test.cjs`.
- Modify `apps/boomer_go_miniprogram/README.md` with truthful activation status.

## Task 1: Tests Before Implementation

- [x] Add an in-memory `wx.request` fixture, synthetic ERP user/device UUIDs,
  public login responses and `/auth/me` responses. No real SMS or credentials.
- [x] Test phone/email password login without fabricated GO username aliases;
  code send uses `purpose: 'login'`; password/code use the same installation ID.
- [x] Successful login requires exact ERP user/device readback. Assert:

```js
assert.ok(calls.every(r => r.url.startsWith('https://erp.boomeroff.com/api/public/')));
assert.equal(calls[1].header.Authorization, 'Bearer ERP_ACCESS');
assert.equal(calls[1].header['X-Device-Token'], 'ERP_DEVICE');
```

- [x] Test simultaneous send dedupe, concurrent login rejection, TTL versus
  cooldown, malformed replies, network/5xx uncertainty, safe errors, no retry,
  no credential persistence and rejected mismatched user/device readback.
- [x] Run `node --test tests/erp-auth.test.cjs`; record missing-adapter failures.
  RED: 13 missing-adapter assertions failed. GREEN: all 16 final cases pass.

## Task 2: Narrow Adapter

- [x] Export `createErpAuth({ wx, installId })` with `sendCode(phone)`,
  `signInWithCode(phone, code)`, `signInWithPassword(account, password)`.
- [x] Pin `https://erp.boomeroff.com` and existing paths
  `/api/public/auth/otp/send`, `/api/public/auth/otp/verify`,
  `/api/public/handheld/auth/bootstrap`, `/api/public/handheld/auth/me`.
- [x] Whitelist request fields, parse `{ok:true,data}`, require valid ERP and
  device IDs, finite positive expiry and nonempty safe credential strings.
  Match `/auth/me` user/device IDs to the issued response before returning it.
  Never install a GO session or infer store rights from the response.
- [x] Share only same-phone pending SMS requests; reject simultaneous logins.
  Bound timeouts, expose uncertain network/consumed-OTP outcomes, never retry.
- [x] Run focused tests. Do not activate the adapter or add backend routes.

## Task 3: Verification And Delivery

- [x] Document the inactive adapter and separate backend acceptance gates.
- [x] Run the complete test suite and `npm run check`.
  Final run: 1982 passed, zero failed/cancelled/skipped; 28 native routes passed.
- [x] Review/commit exact Mini delta via an isolated Git index; preserve dirty
  Flutter work and the normal index. No working-tree branch switch.
  Source commit: `099bce9fa697f31109ad67b6011c1b4bf4b22e37`.
- [x] Report remaining real employee AppID/Donut binding, Tencent ERP issuer,
  historical mappings, business API, refresh/revocation and device acceptance.

Additional source-only server review found non-atomic OTP consumption/attempts
and first-200-user directory lookup. These require deployed-revision review
and shared ERP correction before activation, not another GO OTP database.

## Feedback And Release

Inner loop: `node --test tests/erp-auth.test.cjs`. No cloud writes or paid AI.
This is an integration component, not a working replacement session or a
deployed Mini Program. Activate only after ERP-authenticated business access,
permission revocation and token refresh have been accepted together.
