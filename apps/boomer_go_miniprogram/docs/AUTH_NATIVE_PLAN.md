# Native Account Password Login Plan

**Goal:** Migrate the existing employee Web account/password entry into the native login page, without creating accounts, changing ERP/store authority or using H5.

**Architecture:** Reuse the existing GO phone-password Edge Function and Supabase Auth password grant, validate the candidate token with Auth getUser, then enter the unchanged fresh ERP synchronization path. Keep OTP as the default. User delegated the native initial-version layout and implementation while asleep; this is a bounded existing-function migration, not a new registration or access model.

**Stack:** Existing WXML/WXSS/CommonJS, wx.request and the current session/transport helpers. No new dependency, backend migration, administrative API or password persistence.

## Design Read And Decision

Product is the internal/company/franchise employee workbench. Preserve the current red/white login card, original wordmark, large readable headline, system Chinese font, page gutters and minimum 44px controls. Add two native equal-width mode buttons inside the current card: 手机验证码 (default) and 账号密码. Do not change the five tabs or add a route.

Three alternatives were considered: OTP only leaves existing Web password access missing; phone-password only cannot support existing usernames/email; all three identity branches reuse current endpoints without adding authority. Choose all three branches. The dedicated AppID/WeChat binding gate remains unchanged.

Password mode contains an account input (phone/username/email), masked password input, the same login action and a native forgot-password explanation directing staff to their store administrator. Do not promise SMS/email reset or open a browser. Retain the existing retry-connection action for an already authenticated but unsynchronized session. Mode switching is disabled during authentication/SMS. Clear password and OTP on switch/hide/unload; no password reaches RAM ledgers, disk, logs or analytics. Hidden/obsolete responses cannot navigate or overwrite a newly opened session. Preview never authenticates.

The existing editable login code is the layout reference; previous supplementary Figma writes failed tool-side twice, so do not claim a new editable Figma login frame exists. Use this state specification and verify actual native screenshots after implementation.

## Exact Source Contract

Read from GO Lovable fixed ref 302281df8b2b00962b5b3759578ca8c37d3fa7f8: src/lib/loginIdentity.ts, src/components/auth/LoginForm.tsx and supabase/functions/phone-password-login/index.ts. These match the earlier independent 171330bf audit. No real credentials or authentication calls were used.

- Trim/lowercase only the account. Valid mainland phone goes to phone-password-login; a validated email stays an email; other validated 3-32 alphanumeric/underscore usernames use the source-defined @boomeroff.local suffix. Never append this suffix to a phone number.
- Web account input is max255 and accepts a 3-32 username or a non-whitespace dotted email. Password length is 6-72 JavaScript characters; preserve whitespace and case. No invalid input sends a request.
- Phone endpoint: POST /functions/v1/phone-password-login with {phone,password}, using the public key. Success has ok/access_token/refresh_token but no user/session. The server alone resolves phone to the real Auth account; the client never queries the directory or profiles for this mapping.
- Username/email: POST /auth/v1/token?grant_type=password with {email,password}. No legacy role fallback.
- Both branches require a nonempty token pair, unexpired JWT with a valid subject, GET /auth/v1/user using only that candidate token, and exact returned user.id=JWT subject before any credential installation. This remote validation, not local JWT decoding, establishes Auth identity.
- Persist only the accepted auth materials in the existing session slot, then synchronize through existing erp-scope-sync. Operational identity requires matching user, synced/ack_pending, lease_renewed:true, integer scope_version, non-suspended bootstrap and current authorized store context. A password alone does not authorize business reads.
- Scope failure retains the accepted auth session for explicit restore without resending password or SMS. Authentication errors remain uniform and never reveal account existence or server error text.

Official references inspected: https://supabase.com/docs/reference/javascript/auth-signinwithpassword and https://supabase.com/docs/reference/javascript/auth-getuser. Current Auth REST routing must remain fixed to the configured GO origin; candidate tokens are never put in query strings.

## Ownership And Frozen Interface

Main owns shared/login-identity.js, shared/session.js, shared/transport.js, core tests and integration. Page worker owns only pages/login/index.js/index.wxml/index.wxss, a new tests/login-pages.test.cjs and its narrow visual notes. Existing page JSON, other pages, marketing/upload helpers and backend files remain unchanged.

Page calls session.signInWithPassword(account,password), returning the same verified operational context as signInWithCode. It cannot treat a null result or merely stored credentials as success. Existing session.hasCredentials/restore remain the explicit scope-recovery path.

Transport adds only auth:password and auth:user. The former uses public-key authorization and the fixed password-grant endpoint. The latter is GET /auth/v1/user, uses options.accessToken only for that exact destination and sends no request data. Other actions cannot inherit a caller-supplied candidate token. The session holds candidates privately until server user validation; no candidate is installed early just to make getUser work.

## TDD Execution

- [x] Main: write tests/password-session.test.cjs for exact normalization, invalid zero-I/O, phone token-only response, remote subject mismatch, expired/missing tokens, no premature persistence, current ERP gates, scope-only restore, singleflight across OTP/password and late logout/old identity. Initial thirteen shared tests were observed RED before implementation. The shared suite now has fourteen passing tests including actual session/transport integration with synthetic wx.request; original session/race regressions passed. A malformed nonnumeric exp regression was separately RED then fixed.
- [x] Main: add narrow transport regression tests for fixed URLs/GET/no body, public password grant, candidate header isolation, uniform invalid credentials/rate/unavailable errors and unchanged OTP/refresh/ERP region behavior. Independent readonly review found no new P1/P2 and reran the original thirteen focused/fifty combined tests; the later fourteenth integration test was rerun by main. No real password or OTP was submitted.
- [x] Page worker: eighteen native page tests pass after an observed initial fifteen-test RED run. Both modes, raw password preservation, correct session method, hide/unload/switch clearing, stale/null result rejection, duplicate clicks, scope-only retry, native forgot-password help and preview guards are covered. Independent readonly review reran eighteen tests with no confirmed new P1/P2.
- [x] Main: independently reviewed the auth files and ran the full suite after the upload-current-object patch: 587/587 passing. Actual official DevTools screenshots show default OTP, password mode, native forgot-password help and empty-account local validation. No real credentials or SMS were submitted. Mode return shows an empty password placeholder; password masking is source/VM-tested, not yet proven by a screenshot containing typed password dots. A mislabeled help screenshot was renamed rather than presented as masking evidence. Static/official compilation is recorded in the final verification checkpoint.
- [x] Push only mini-program changes using the isolated index; remote SHA 93334663d24dcc9da2a616fb2badb1ee58d87b89 was read back with ls-remote. The current Flutter branch and empty normal index were preserved; the feature matrix records the remaining reset/registration/device gaps.

Registration, invitation acceptance, actual password reset/change, employee AppID, real account acceptance and auth rate-limit enforcement remain separate gaps. Do not expose an administrator reset endpoint or reproduce the old non-atomic invite client writes.
