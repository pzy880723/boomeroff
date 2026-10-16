# Native Learning Filter Parity Plan

> For agentic workers: use executing-plans and test-driven-development. Preserve disjoint page/shared ownership and the current Flutter checkout/normal index.

**Goal:** Migrate the actual employee official-library filters and own-library classification without inventing all-library counts, global hot rankings, new source filters or content-shop authority.

**Architecture:** Reuse native learning/list/detail routes and existing BOOMER styling. Fix the existing supported official category entry first. Coordinate an additive caller-RLS official-library read window and minimal source metadata directly with GO Lovable; freeze its final source/DTO before using new parameters. Keep original knowledge and grading behavior compatible.

**Tech Stack:** Native WeChat WXML/WXSS/CommonJS, Node VM tests, official compilers, existing GO Lovable Cloud and PostgreSQL RLS.

## Source And Design Evidence

- Fixed Web ref813c12840f12a904fd07e6bc3a8bb08359b01090; the relevant files/handlers are unchanged in R30 ref021a5adbe3e0146cffcae69de5a38e49fcc3949b.
- OfficialLibrary.tsx108-149: category/ip_name/era/origin equality; name/IP/summary search; at most60 minimal rows. Category all permits latest/important/hot; a selected category always uses latest. Hot ranks only the most recently updated matching60 by favorite_count*3+view_count, not the whole library.
- types/index.ts168-216:17 current choices in fixed order plus8 legacy display labels. All is an unset filter, not another stored category. Unknown nonempty category strings retain their label; dirty objects/arrays do not become labels.
- OfficialDetail.tsx281-314: category opens only category, IP opens category+ip_name, era and origin each open only that value. Use original keys, not translated display text or sub_type.
- MyLibrary.tsx159-186/238-248/623-664: official/product current source category/name/cover, then snapshot fallback; recognition uses snapshot. Groups by loaded category, count descending, preserve original order within a group. No interactive source/category filter exists; do not invent one as parity.
- Editable design: Figma SXY4nF6NWwrsw3jxZOIaDU frames21:2 and21:18. Native red/white five-tab direction remains unchanged. These are design examples, not employee or runtime evidence.

## Phase 1: Existing Supported Category Entry

Worker-owned paths: create shared/knowledge-categories.js and tests/official-category-entry.test.cjs; modify pages/learn/index.js/wxml/wxss, pages/list/index.js/wxml/wxss and only category-label projection in pages/list/model.js. Do not touch shared API/preview/app routes, detail, backend, Git or docs.

- [x] Add focused failing real-page tests for official category options when BFF omits categories; exact17 order/keys/labels; all unset; exact selected category sent through existing knowledge action on both learning source=official and list kind=official.
- [x] Cover source/kind switches, rejected malformed/unknown picker input, disabled pending reads, page hide/unload/revision races, old responses, retry and load-more preserving the filter. Product knowledge must not advertise unsupported category filtering; training categories remain server-provided.
- [x] Implement one small immutable category/label map. Preserve raw category codes and unknown strings; add a separate display label so DTO keys are never replaced by Chinese labels.
- [x] Reuse the existing category area with an accessible native picker for official knowledge; all17 choices stay available independently of one response page. Keep non-official behavior and learning pagination intact. No IP/era/origin/sort calls until verified Phase2.
- [x] Run focused and existing learning/list regression tests; freeze and return exact paths/counts for independent parent review. No production reads or writes.

Phase1 checkpoint:37 category tests,3 real-wrapper detail lifecycle tests and full1252 tests passed. Two old product-category fixtures were corrected to official-source semantics, not weakened. Official compilers25 WXML/26 WXSS and24 routes passed. Actual DevTools native wheel selection of 日瓷 returned exactly the corresponding synthetic row; evidence/native-official-category-selected-phone.png. This remains local preview evidence.

## Phase 2: Additive Backend And Full Filter Window

GO R32 message umsg_01m519gajne2cs0cnpevr3q34k on main completed at fixed ref ccaaf0ae670ef234cba432a83ff20abb9b8274a8. It is independent of unapproved R27. The frozen DTO, hashes, reviewed source and reported deployment boundaries are in OFFICIAL_LIBRARY_NATIVE.md.

- [x] Independently read final fixed source, hashes, migration/ACL/RLS and tests. Verify caller-bound literal search and minimal projection, source batching/error handling, reported application/deploy separately. No real employee, OTP or paid AI tests.
- [x] Freeze final additive official-library DTO. Requested contract is one <=60 row read window with exact filters, requested/effective sort, window_limit and as_of; render20 at a time locally without new server page queries or a fake global hot rank. Legacy knowledge behavior stays unchanged.
- [x] Add RED tests before wiring IP, era/origin clear chips, category reset, effective latest in a category, bounded hot/important windows, query limits, response bindings, local load-more, stale/lifecycle guards and preview fidelity.
- [x] Implement exact supported filters on learn and secondary official list; detail metadata opens the native secondary list with original filter values. Do not use switchTab query strings or H5. Do not derive full era/origin catalog options from one result window; those values originate in actual detail metadata.
- [x] Consume optional caller-RLS source_metadata only for current owned favorites. Distinguish missing/invisible source from query error; preserve snapshot/quiz/passed. Add source badges and loaded-only category grouping, with unknown string categories retained. No new source filter or all-library count.
- [x] Independent review, full tests/route check/official compilers, actual labeled GUI states and screenshot evidence.
- [x] Isolated Mini-only commit/non-force push/readback and clean archive verification.

Phase2 local checkpoint: parent and independent full1321/1321, no failures/skips/cancellations;24 routes and25 WXML/26 WXSS passed. Four focused worker suites90/90, related independent regressions152/152. Parent API tests2 RED then4 GREEN; preview3 RED plus ordering1 RED then GREEN; detail8 RED then8 GREEN plus3 lifecycle. Three old official fixtures now use the fixed DTO/local window while a separate product server-pagination regression remains. Actual DevTools checked all/hot/category/IP, detail metadata era-only native refilter and chip clear back to3 rows, and owned groups2 other+1日瓷. All fixture data is explicitly synthetic; no real employee or paid generation.

Source checkpoint dcf2798a5ce120519883af9b3577ca94af50be19 contains31 Mini-only paths and was non-force pushed/read back identical. Clean archive /private/tmp/BOOMER-GO-wechat-learning-filters-20261016.zip:1018174 bytes, SHA256548a62e2aaf8a75a25842f392831f260a920a2d44e39bdebc0dc74bfbb5bb2bf. Independent extraction passed1321/1321 and24 route checks. Normal Git index remains untouched; no claim of main merge or live WeChat release.

## Unchanged Gates

Dedicated employee AppID and real employee/device acceptance remain open. Source implementation and synthetic tests do not establish production login, saved grades, actual source availability or public release. Sales/leaderboards stay display-only. R27 content-home and all other products remain untouched.
