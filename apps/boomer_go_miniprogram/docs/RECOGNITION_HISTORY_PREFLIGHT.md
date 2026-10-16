# Recognition History Native Migration Audit

2026-10-16. This is source-based migration evidence, not a new backend contract or deployment claim.

## Actual Existing Web Behavior

Fixed GO source `813c12840f12a904fd07e6bc3a8bb08359b01090`, read directly through the connected GO Lovable project:

- `src/pages/History.tsx:77-95`: records default to `created_by=current user`; only existing `history.read_all` permits the broader query. Category filtering is server-side. Lines131-143 search the currently loaded window by name/category/era/material/craft/description.
- `src/components/history/ProductDetailDialog.tsx:61,82-115,117-125,265-275`: admin UI gates editing, deletion and explicit AI knowledge-card generation. Generation invokes `enrich-knowledge-core` with `needCover:false`, merges only the generated card into existing analysis, and is separate from ordinary reading.
- `src/components/history/ProductEditDialog.tsx:74-105`: eleven editable fields: name/category/era/origin/material/craft/description/dimensions/condition/selling_points/tips. Name is nonempty after trim; empty optional strings become NULL; selling points are split by nonempty trimmed lines. Old Web writes have no CAS or immutable request receipt, and card save does not check its final update error. Do not copy these as reliable success guarantees.
- `src/integrations/supabase/types.ts:2046-2113`: products have created_by and updated_at but no shop_id. A store filter cannot safely be invented from the current employee profile or product name.

Independent reviewer also read candidate `a4d6edb0d26775242ab23b363f9d9d62eb6f7976`; the existing product edit/delete permission policies differ from the admin-only UI. Their exact effective gate must be frozen before exposing native management. Do not grant ordinary employees personal product deletion merely because they own a record.

## Native Read And Save Contract

Actual fixed candidate `supabase/functions/go-mini-api/index.ts:223-291,583-587`:

- `knowledge-detail` history requires the caller's created_by; recognition-save stores the same eleven business fields plus complete analysis and original image URLs at `ai_analysis.__go_mini.image_urls`, with client_submitted=true.
- `scan-history` reads only the caller, uses zero-based page/page_size, defaults20/max50 and an extra row for has_more. It ignores query and category. Its lightweight projection lacks material/craft. No product-update/delete/status management actions currently exist.
- Native list previously forwarded query/category but did not filter locally: searching returned unchanged rows. That confirmed bug is now fixed without changing backend authority. history/recognition retain an identity/revision-bound loaded window, search actual projected name/category/era/description, preserve server pagination and deduplicate append by id. Clearing search restores the window; zero matches do not mean the server has no next page. This is not full material/craft search, server-side category support or admin all-history parity.
- First-read search retains the query without claiming an identity mismatch; genuine first-read failures stay visible. An actually changed loaded identity clears the retained window. Hidden/unloaded callbacks and forged or filtered-out navigation cannot use old rows.
- Existing native gallery previously ignored the saved multi-photo field. It now uses that field only for verified history/recognition or available recognition/product favorite sources. Existing valid raw.gallery wins. Fallback requires strict true marker and a whole1-5-string valid HTTPS group; malformed groups are ignored without breaking the story. No recursive metadata search, new API request, signing or authorization is added. Caller-RLS-visible other-person product favorites are not incorrectly forced into the current user's image directory.
- HTTPS validation reuses the existing media rule; it is not a strong project-domain/path ownership verifier. The metadata flag is never an authorization proof. No actual image download or device album acceptance was performed.

## Remaining Full Migration Work

1. Owner-coordinated metadata/RLS/FK audit and an exact caller-bound capability contract for existing edit/delete and history.read_all permissions; no broad grants or guessed store ownership.
2. Supported category filtering and material/craft projection, with exact pagination semantics. The loaded-only fix does not replace these requirements.
3. Native management design and one editor with explicitly changed eleven-field patches, preserving NULL and unknown selling-point/tips/analysis metadata. Atomic expected-version and original-request receipts/status are recommended additions, not endpoints already deployed.
4. Explicit dangerous deletion with precise result reconciliation; inspect actual product FK/Storage behavior first. Removing a favorite is not deleting a product, and a404 alone is not deletion proof.
5. Separate explicit AI-card generation/candidate adoption, recognition refinement chat and existing realtime-session parity; no automatic paid retry or fabricated response.
6. Real employee/device camera, save/history/readback, media and permission acceptance. Flutter local notes are a distinct device store, not automatically migrated by cloud history.

R36 activity management remains paused at its human spending decision. This audit does not start a replacement Lovable task or bypass that pause. No real business row, employee credential, photo, OTP, SMS or paid model was used.
