# BOOMER GO Employee Mini-program

Native WeChat WXML/WXSS/JavaScript initial implementation. It does not embed the website, navigate to H5, replace the existing iOS app, or modify the customer BOOMER OFF mini-program.

## Current Delivery State

- Five approved native tabs: 工作台 / 学习 / 识物 / 消息 / 我的.
- Twenty-three native routes, including OTP/account-password login, month schedule, knowledge detail, server-graded single/continuous practice, sales, assistant, video generation, asset delivery, staff chat, community detail, customer-code voucher lookup/redemption, activity/application and current-store SOP/QA entry/category maintenance pages.
- Source and interaction tests run locally; the five tabs and schedule have been inspected in the official WeChat DevTools simulator.
- Real requests use the existing GO identity, fresh ERP scope and original backend records. Preview fixtures are separate, explicitly labeled, development-only and never an API-error fallback.
- This is **not a published or real-device-accepted mini-program**. The project currently uses `touristappid`; a dedicated BOOMER GO employee AppID, domain configuration, privacy declarations and a genuine authenticated acceptance session are still required.
- Missing sales attribution is not fabricated. Personal rankings remain unavailable until ERP records sales ownership. Sales do not contribute to employee assessment.

## Open The Initial Version

Import this directory in the official WeChat DevTools. The project configuration points to `miniprogram/`. Select the native initial-preview compilation condition or use the clearly labeled preview button on the native login page. All preview employee/store/shift values are synthetic.

The real login condition defaults to existing phone OTP and also supports the existing employee phone/username/email password entry. Both remotely validate Auth identity and require ERP scope synchronization; neither uses a test password or bypasses ERP authorization. Do not repeatedly consume an OTP after an uncertain network response. A retained authenticated session can retry scope synchronization without requesting another SMS or resending its password. Passwords are never persisted.

## Configure And Check

```sh
npm run configure
npm test
npm run check
```

`tools/configure.cjs` writes `miniprogram/config.js` using only the existing **public** Supabase URL and publishable key from the parent repository `.env`. It never copies service-role keys, mini-program AppSecret or server deployment credentials into the mini-program. This is public client configuration, not a server environment file.

Current API origins are the existing GO Lovable Cloud project and `https://erp.boomeroff.com`. Before real-device preview, configure the HTTPS request and download domains in the dedicated employee mini-program console. Chat attachments also require the existing GO Supabase origin as an uploadFile legal domain. Keep URL/TLS checks enabled. Configure required media/privacy declarations in that console rather than inventing `app.json` permission fields.

## Authorization And Data

- A verified Auth session must complete `erp-scope-sync` with matching identity, a renewed lease, stable scope version and fresh shop context.
- Store employees see only the backend-authorized working store; only verified headquarters scope permits authorized store selection.
- GO shop IDs are mapped through ERP `/session` to ERP location IDs. They are never guessed from names or passed as ERP IDs.
- Knowledge, schedules, notifications and user records come from their existing tables. The additive `go-mini-api` is coordinated directly with Lovable.
- Personal learning has loaded-only pending/mastered filters, exact content-source history routing and a read/single-quiz/refresh loop. Server pagination remains visible even when a local filter is empty. Historical results are latest-per-content, not a recovered archive of every old question.
- Continuous practice uses the same latest300 favorite window as Web and at most five items per round, not a daily cap. Saved server-confirmed attempts update only minimal user/store/Shanghai-day device progress; failed tests count as practiced, not mastered. Unknown answers retry the original token; they never advance a new-day queue. Explicit skip is not completion, and preview progress is RAM-only.
- Correct quiz answers remain on the server. Grading and the first submitted result are frozen by an atomic server operation. The client never claims persistence when the server did not confirm it.
- Confirmed results support an explicit native retake without force-regenerating the question pool. First exact server expiry can explicitly restart; prior uncertain submissions keep the original token/answers even after a later expiry. New questions replace the old result only after complete validation. True sign-out or page unload still clears page-local answers.
- Current-store SOP/QA has native server search, categories, Markdown reading and existing-permission manual editing. Shared entries stay read-only; title/body/tags/category are sent together, preserving existing tags. Unknown writes retain the original request in process RAM for explicit reconciliation, never automatic resend. A matching receipt plus exact readback is required before showing success. AI assistance displays a complete candidate and requires a separate adoption confirmation; it never auto-saves or creates categories. Editing after generation makes the candidate stale. A separate native category page uses the independent existing category permission for explicit creation, name/numeric-sort editing and deletion. Shared categories stay read-only; deletion retains entries, removes their category binding and refuses references outside the current store/type. Category receipts, CAS conflicts and unknown intents are separate from entry writes.
- Recognition uses native `<camera>` and `takePhoto`; each successful photo goes straight into the tray, up to five photos. Album selection is a separate action.
- Image/video album saving reports success only after WeChat confirms it. OS/WeChat privacy or album permission cannot be silently bypassed.
- Marketing uses existing script and video jobs. Exiting a page does not issue a cancellation. Cover, video and frozen publishing copy have separate native controls.
- Voucher templates and customer claims are distinct. The native redemption entry scans only to query; mutation requires a separate confirmation and a matching server receipt. An uncertain request is reconciled by its original key, never silently replaced or automatically resent.
- Schedule viewing distinguishes explicit rest from missing data. Coworker views require the server's existing permission and exact selected store; this does not grant schedule editing authority.
- Without today's selected working shop, the personal month uses the existing caller-authenticated NULL-shop schedule RPC with verified uid and strict server freshness checks before/after reading. It projects only the caller's work/rest rows and suppresses coworker capability. This does not resolve canonical home or grant schedule management.
- Workbench shifts use the actual authorized schedule shop, independently of the browsing selection. Ambiguous legacy shift definitions show a notice instead of invented times. Rest-day content access remains an open backend/client item; a mutable profile shop is not silently treated as authoritative home.
- OKR details find the exact ID across the existing caller-scoped zero-based pages. Existing key-result JSON and partial progress are retained; only explicitly changed fields are submitted. Key actions are limited to the backend's 4000 characters. A matching update payload and independent readback are required before success. Unknown saves are not resent automatically. This old endpoint has no CAS or immutable request receipt, so concurrent-write protection is not claimed.
- Activity applications require existing same-store management authority. Publication confirmation is separate from approval, voucher issuance, redemption and social publishing. Stage2 adds original-file selection/upload/status recovery, now aligned to fixed Round16/17 source. Lovable reports the additive migrations and Edge deployed. Strict current-object proof and original activity/shop binding preserve historical paths without signing changed or rebound objects. This is not a verified live employee uploader; fixed-source review and deployment reports do not replace real employee acceptance.

## Verification And Remaining Acceptance

See `docs/CURRENT_FEATURE_PARITY.md` for the current functional migration matrix, `docs/FEATURE_PARITY.md` for historical source comparisons and `docs/VERIFICATION.md` for concrete checks and limitations. Design source: https://www.figma.com/design/SXY4nF6NWwrsw3jxZOIaDU

The screenshot files in `evidence/` are local review evidence, not proof of real login, camera hardware, successful billing, saved grades, completed video generation or public release.

The first ERP leaderboard candidate was not promoted because another release changed its baseline. A second candidate was rebuilt from `youzan-points-identity-20261016`, passed all 104 GO bridge tests and the production build, then promoted with a baseline comparison and rollback guard. The public leaderboard route now rejects anonymous requests with 401; existing worker environment was preserved and the temporary candidate process stopped. This verifies deployment and denial, not authenticated revenue or ranking acceptance.
