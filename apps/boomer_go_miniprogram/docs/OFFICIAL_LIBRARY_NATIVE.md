# Official Library Native Contract

## Fixed Source And Evidence

GO Lovable project bef32724-503e-467a-af03-2062176cf921, R32 final ref ccaaf0ae670ef234cba432a83ff20abb9b8274a8. This is independent of the unapproved R27 content-home plan.

Parent and independent reviewer inspected the final migration/Edge/tests. Exact remote SHA256: migration0026 397d81bcc488e1a80e76954d99a8e645bfc2dd0bedebbefb336957ecebb06de6; library.ts 8cecaa341084528cab195d194fe70cb2fb643029bef326da010889e3e9bfa8b2. Local audit snapshots have one extra LF. Isolated Node replay27 and extra boundary6 passed. Lovable reports SQL rollback tests, migration application and Edge deployment; these are not independent live authenticated acceptance or SQL concurrency proof.

## Additive Read Window

`go-mini-api` action `official-library` accepts only q/category/ip_name/era/origin/sort. No page, actor, table or shop_id. Fresh Auth/ERP scope still applies, but no selected-shop requirement or automatic shop injection.

- Empty/absent/null filters normalize to null. Only q is trimmed. Other exact filter strings remain unchanged.
- Unicode codepoint limits: q80/category80/IP120/era120/origin120. Reject NUL, lone surrogates, nonstrings and extra keys; never silently truncate.
- sort latest/hot/important, latest default. A nonempty category forces effective_sort latest.
- Response: items<=60, filters with the five normalized values, requested_sort/effective_sort, window_limit60, as_of. Each item has id/name/category/ip_name/summary/era/origin/cover_url/selling_points/tips/view_count/favorite_count/importance_score/updated_at. UUID IDs are unique within the accepted client window; invalid/mismatched responses fail closed.
- latest uses the latest60 matching updates. hot reorders only that latest60 window by favorites*3+views. important selects by importance then latest. This is not a global hot rank or total count.
- Native renders20 at a time from the same in-memory window; local load-more never sends page requests. A new filter/refresh gets a new complete window. Old scope/filter/hide/unload results cannot replace current content.
- Caller-bound SECURITY INVOKER RPC with literal escaped ILIKE and exact equality; no RLS/table grant expansion. Existing knowledge and quiz behavior remains unchanged.

## Native Filters And Detail Links

Keep the exact17 current category choices and8 legacy display labels. Category changes clear IP. IP options match CATEGORY_SUBCATEGORIES at the fixed Web ref and are sent as ip_name, not sub_type. Only all-category views offer latest/hot/important. Era/origin chips originate in actual detail metadata, not an invented catalog derived from one result window.

Helper exports agreed for parent/detail use: `urlForFilters(filters)` and `readOptions(options)`. Use `/pages/list/index?kind=official&official_filters=` plus one encodeURIComponent(JSON.stringify(minimalFilters)). Parser first tries raw JSON (platform already decoded), otherwise decodes once then parses JSON. Strictly validate the parsed object/filter keys. Preserve literal percent sequences; malformed supplied filters must show an error rather than silently showing all content.

Detail category opens category only; IP opens category+ip_name; era and origin each open only that original value. Use native navigation and current loaded identity/visibility guards. Display labels never replace raw query values.

## Owned Library Projection

my-library/practice-library optionally return source_metadata null or {name,category,cover_url}, strings/null. It is current caller-RLS source metadata for official/product favorites only, recognition remains snapshot. Missing/invisible source is null; a source query failure fails the full response. Preserve quiz/passed/snapshot fields.

Use current source metadata then snapshot fallback for display. Group only loaded owned favorites by category, count descending, preserve existing row order within each group. Unknown nonempty categories retain raw labels; absent categories use other. Show source badges, not a new source filter. Counts say loaded, never all-library totals. Continuous practice remains the existing latest300 window and grading rules.

## Integration Ownership

Meitner: shared/official-library.js and category helper IP metadata, learn/list JS/WXML/WXSS, list/model.js projection/grouping, focused tests including updates to category-entry tests for the additive official action. Parent: shared/api.js and tests, preview and tests, detail and tests, docs/integration. No shared route/app/other product edits or Git by workers.

Phase1 verified1252 tests/24 routes/25 WXML/26 WXSS plus actual DevTools selection of 日瓷 showing its single labeled synthetic row. Phase2 requires fresh tests, compilers and real GUI evidence before checkpointing. Dedicated AppID, real employee/device and public release remain open.
