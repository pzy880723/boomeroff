# Native Publishing History

2026-10-16. Source audit: GO a4d6edb0d26775242ab23b363f9d9d62eb6f7976, not ERP or a consumer Mini Program.

## Existing Contracts

- Web History.tsx reads social_publish_jobs under the caller JWT, shop_id exact filter, created_at descending,limit50 and nested target platforms. This is a store-shared latest50 window, not personal-only, complete history, a count or a stable snapshot.
- New native transport exposes only `rest:publish-history`: fixed table, safe fields, current shop UUID, order and limit. No general table/query/mutation interface or public-token fallback. Data API RLS remains authoritative; no grants or policies were changed.
- Existing dispatch-job-status reads exact job and targets. Its server uses the legacy admin or staff-profile-shop gate with service credentials internally, not a new caller-RLS/fresh-scope implementation. Mini HQ is not mapped to legacy admin. The native caller independently requires a fresh selected ERP-authorized shop and rejects wrong-shop/job/target results, but this is not a server authorization rewrite.
- The current mutable staff_profile shop and rest-day content context findings remain open in CONTENT_CONTEXT_AUDIT.md. No home fallback or authorization expansion was added.

## Native Flow

Marketing has a native button into pages/publish-history/index. The secondary route preserves the five tabs. It reads existing jobs; an explicit selected row opens inline read-only detail. List and detail refresh separately; close keeps the list. Hide/unload clears private display; same-context foreground rereads, while old identity/store/revision responses and old401 cannot affect a new context. Current401 uses the existing shared sign-out protection.

API methods `publishHistory()` and `publishStatus(jobId)` return only whitelisted display fields. IDs and shop/parent relations are exact; missing/duplicate/invalid rows are errors, not empty success. Unknown states are explicit, unreported progress is null, and the real field platform_post_url is displayed only as safe HTTPS text. No H5 route opens. Credentials, worker tokens, internal file paths and full raw records are not installed in page data.

No polling/realtime guarantee is claimed. This route has no create, retry, cancel, account-login or other mutation. Existing asset-page controls remain separate; historical retry/cancel integration and account lifecycle are still migration work. A matching title or timestamp cannot prove which unknown submission created a task; no idempotency or safe resend guarantee is claimed.

## Growth Feedback

Mine now displays the existing Web25-level thresholds and titles from src/lib/level.ts. Valid nonnegative cloud EXP follows the same formula; missing/invalid EXP is unavailable, not zero. Negative cloud EXP is retained as the raw balance and explicitly not assigned a level, rather than silently clamped to a fabricated zero balance. The expandable list shows all25 thresholds; it does not promise reward rates or infer activity counts. Growth display is not a sales or examination assessment or an appraisal qualification.

## Evidence Boundaries

Figma30:2/30:15 are rendered editable designs. Native screenshots in evidence/native-publish-history*,native-publish-status*,native-growth-level* and native-growth-rules* are actual DevTools screenshots with explicit synthetic labels. No real publishing, employee record, OTP, paid model, deployment or phone operation occurred. True caller-RLS behavior, authenticated status access and real-device acceptance remain unverified.
