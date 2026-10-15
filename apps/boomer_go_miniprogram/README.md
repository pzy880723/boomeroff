# BOOMER GO Employee Mini-program

Native WeChat WXML/WXSS/JavaScript initial implementation. It does not embed the website, navigate to H5, replace the existing iOS app, or modify the customer BOOMER OFF mini-program.

## Current Delivery State

- Five approved native tabs: 工作台 / 学习 / 识物 / 消息 / 我的.
- Seventeen native routes, including phone login, month schedule, knowledge detail, server-graded quiz, sales, assistant, video generation, asset delivery, staff chat, community detail and customer-code voucher lookup/redemption.
- Source and interaction tests run locally; the five tabs and schedule have been inspected in the official WeChat DevTools simulator.
- Real requests use the existing GO identity, fresh ERP scope and original backend records. Preview fixtures are separate, explicitly labeled, development-only and never an API-error fallback.
- This is **not a published or real-device-accepted mini-program**. The project currently uses `touristappid`; a dedicated BOOMER GO employee AppID, domain configuration, privacy declarations and a genuine authenticated acceptance session are still required.
- Missing sales attribution is not fabricated. Personal rankings remain unavailable until ERP records sales ownership. Sales do not contribute to employee assessment.

## Open The Initial Version

Import this directory in the official WeChat DevTools. The project configuration points to `miniprogram/`. Select the native initial-preview compilation condition or use the clearly labeled preview button on the native login page. All preview employee/store/shift values are synthetic.

The real login condition uses existing phone OTP and ERP scope synchronization; it does not use a test password or bypass ERP authorization. Do not repeatedly consume an OTP after an uncertain network response. A retained authenticated session can retry scope synchronization without requesting another SMS.

## Configure And Check

```sh
npm run configure
npm test
npm run check
```

`tools/configure.cjs` reads only the existing **public** Supabase URL and publishable key from the parent repository `.env`. It never copies service-role keys, mini-program AppSecret or server deployment credentials into the mini-program. `miniprogram/config.local.js` is ignored.

Current API origins are the existing GO Lovable Cloud project and `https://erp.boomeroff.com`. Before real-device preview, configure the HTTPS request and download domains in the dedicated employee mini-program console. Chat attachments also require the existing GO Supabase origin as an uploadFile legal domain. Keep URL/TLS checks enabled. Configure required media/privacy declarations in that console rather than inventing `app.json` permission fields.

## Authorization And Data

- A verified OTP session must complete `erp-scope-sync` with matching identity, a renewed lease, stable scope version and fresh shop context.
- Store employees see only the backend-authorized working store; only verified headquarters scope permits authorized store selection.
- GO shop IDs are mapped through ERP `/session` to ERP location IDs. They are never guessed from names or passed as ERP IDs.
- Knowledge, schedules, notifications and user records come from their existing tables. The additive `go-mini-api` is coordinated directly with Lovable.
- Correct quiz answers remain on the server. Grading and the first submitted result are frozen by an atomic server operation. The client never claims persistence when the server did not confirm it.
- Recognition uses native `<camera>` and `takePhoto`; each successful photo goes straight into the tray, up to five photos. Album selection is a separate action.
- Image/video album saving reports success only after WeChat confirms it. OS/WeChat privacy or album permission cannot be silently bypassed.
- Marketing uses existing script and video jobs. Exiting a page does not issue a cancellation. Cover, video and frozen publishing copy have separate native controls.
- Voucher templates and customer claims are distinct. The native redemption entry scans only to query; mutation requires a separate confirmation and a matching server receipt. An uncertain request is reconciled by its original key, never silently replaced or automatically resent.
- Schedule viewing distinguishes explicit rest from missing data. Coworker views require the server's existing permission and exact selected store; this does not grant schedule editing authority.

## Verification And Remaining Acceptance

See `docs/FEATURE_PARITY.md` for the source-backed migration matrix and `docs/VERIFICATION.md` for concrete checks and limitations. Design source: https://www.figma.com/design/SXY4nF6NWwrsw3jxZOIaDU

The screenshot files in `evidence/` are local review evidence, not proof of real login, camera hardware, successful billing, saved grades, completed video generation or public release.

The first ERP leaderboard candidate was not promoted because another release changed its baseline. A second candidate was rebuilt from `youzan-points-identity-20261016`, passed all 104 GO bridge tests and the production build, then promoted with a baseline comparison and rollback guard. The public leaderboard route now rejects anonymous requests with 401; existing worker environment was preserved and the temporary candidate process stopped. This verifies deployment and denial, not authenticated revenue or ranking acceptance.
