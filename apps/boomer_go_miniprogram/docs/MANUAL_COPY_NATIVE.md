# Native Manual Copy Materials

2026-10-16. Secondary native page inside the material library, not a separate AI-copy product. It does not generate text, enqueue publication or invoke paid models.

## Existing Contract

The fixed GO Web source `a4d6edb0` UploadAssetDialog creates manual copy in `marketing_assets`, and AssetDetailDialog edits `output_text`. The native adapter uses that same table under the current caller JWT and existing RLS. No migration, role grant, service credential or backend deployment was added.

The native management subset requires exact current `user_id`, selected authorized `shop_id`, `kind=copy`, `meta.source=manual_upload` and `meta.asset_class=upload`. Generated material and other employees' records cannot open this editor. This is deliberately narrower than legacy administrator-wide material management.

Create uses POST with a frozen client UUID and no upsert. Read, PATCH and DELETE use fixed actor/shop/id/kind/source/class filters and an explicit field projection. PATCH only changes `output_text`; PATCH/DELETE also require the original `output_text` equality (or `is.null`). Query parameter values are URI encoded; the ordinary scalar `eq` operand is not additionally quoted or backslash escaped. This follows the separate scalar parser, not the `and/or` quoted-value grammar. See [official PostgREST v14 parser](https://github.com/PostgREST/postgrest/blob/v14.0/src/PostgREST/ApiRequest/QueryParams.hs) and [official postgrest-js filter implementation](https://github.com/supabase/postgrest-js/blob/master/src/PostgrestFilterBuilder.ts).

## Content And Confirmation

- Title is optional, max60; trimmed body is required, max1000. Overlong drafts remain visible and invalid, never silently truncated.
- Existing JSON candidate arrays retain all unedited candidates, unknown fields and hashtags. Legacy plain body uses the first metadata candidate's title/unknown fields/hashtags but the actual current `output_text` as body. Extra metadata candidates are not promoted into active JSON candidates, and original metadata is not rewritten.
- Native save/delete have separate confirmation. Matching mutation representation is independently read back by exact ID before a completion notice. Current content equality proves visible outcome, not immutable request attribution or a full-row version lock.
- Unknown requests are never automatically resent. An immutable original operation is retained in actor/shop-scoped App RAM across page unload; new creation cannot choose another UUID while that slot is unresolved. This is not disk persistence or process-restart recovery.
- Unknown deletion plus absent row stays unconfirmed. A matching DELETE representation and subsequent absent readback are both required. Only the asset row is deleted; Storage, publishing jobs and remote posts are not deleted.
- Same-account revision/identity/store changes invalidate private UI; hide/unload invalidates reads and confirmation callbacks. Current visible401 uses the common login handler; stale hidden401 does not sign out the current session.

## Verification Limits

Unit/VM/transport tests and the explicit synthetic developer preview cover local draft input, candidate switching and disabled mutations. The preview never saves, deletes or reconciles production data. The official compiler and native route checks do not establish real employee RLS/CRUD acceptance. Dedicated employee AppID, device authorization and a separately controlled authenticated acceptance run remain required. Full Web migration is tracked in CURRENT_FEATURE_PARITY.md.
