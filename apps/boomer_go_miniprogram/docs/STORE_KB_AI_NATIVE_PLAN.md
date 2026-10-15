# Current-store Knowledge AI Draft Plan

**Goal:** Migrate the existing employee SOP/QA AI drafting into the native editor without privilege expansion, automatic category creation or automatic knowledge saving.

**Architecture:** A new `kb-draft` action in the existing GO BFF uses caller JWT authority, a narrow SECURITY INVOKER reference RPC and the existing configured Lovable AI gateway. The native editor displays a complete candidate and adopts it only after explicit confirmation. Existing manual save/CAS/receipts remain unchanged.

**Stack:** Existing CommonJS/WXML/WXSS editor, caller-JWT Supabase RPC, pgvector and existing gateway/model configuration. No H5, new tab, new database, category writes or client secrets.

## Source And Design Decision

Base source: GO project `37e0466774995fac4ead86325d223b641a57dbe1`, confirmed finished. Existing `generate-shop-kb/index.ts` uses Gemini2.5Pro structured tool output and type-specific SOP/QA prompts; Web MySop/MyQa supplies topic/hint then auto-creates a category. Its service-role kbSearch calls `match_kb`, whose original migration declares SECURITY DEFINER. Do not copy either privileged retrieval or category side effect. Existing shared helper swallows embedding/search failures; the new path must distinguish a genuine empty reference result from failure.

Alternatives: calling the legacy endpoint preserves its access faults; replacing semantic retrieval with only generic text loses existing knowledge grounding; a narrow caller-JWT semantic reference RPC preserves the intended feature while retaining RLS. Choose the third. Do not globally change the old endpoint, old match_kb, Web UI, unrelated applications or permissions in this step.

User delegated overnight design and implementation of full employee-native parity. Reuse the red/white native editor rather than add another page. A default-collapsed AI panel sits below the title: topic comes from that title, optional natural-language hint has a visible2000-code-point limit without input truncation. Generate is explicit, single-flight and never auto-retried. The existing manual fields stay editable while generating, but save/delete and candidate adoption cannot overlap generation.

The candidate shows its complete title, category, tags and safe Markdown body, source titles and an explicit unsaved/unadopted label. Adopt requires a separate native confirmation before replacing all four RAM draft fields. Preserve existing `okr-highlight` if absent from model tags, display it in the candidate and validate the merged limits; only explicit manual editing removes it. Do not let the model invent that operational tag. If any manual field or hint changes during/after generation, keep the candidate readable but stale and disable adoption; ask for explicit regeneration, not complicated field merging or forced overwrite.

Shared/read-only/conflict/pending/receipt-confirmed/saved/unverified states disable generation and adoption. Capture identity/store/revision/epoch/resource/base/edit/hint versions. Hide/unload clears candidate and invalidates late callbacks; scope change clears AI private state. Failure preserves the original draft/hint. Preview disables paid generation and adoption; no fake completed candidate or real provider call is needed for UI verification. Do not claim hiding cancels network activity or billing.

Prior supplementary Figma edits failed; no new Figma frame is claimed. This precise state design and editable WXML implementation are the fallback, followed by actual native screenshots.

Independent fixed-source audit confirmed that old `kb_documents` SELECT uses admin/shared/current_user_shop_id, where the latter is staff_profiles.shop_id, not all ERP-authorized stores. A temporary work-store transfer can therefore see no readable store references even after current-store gate succeeds. Preserve that RLS result; never fallback to service role or widen policy. Old-path defects were reproduced with four synthetic mocks; no actual provider or business data was used. Supabase's current database-function documentation also recommends INVOKER for RLS-preserving reads; changelog/docs were checked without changing SDK/auth/TLS settings.

## Frozen Wire Contract

`kb-draft {shop_id:uuid,type:'sop'|'qa',topic:string,hint?:string}` ->

```text
{shop_id,type,topic,hint,
 draft:{title,body,tags:string[],category_id:uuid|null},
 categories:[{id,shop_id,type,name,sort_order}],
 sources:[{id,source_type,source_id,shop_id,title}],
 reference_state:'matched'|'none',generated_at:ISO,persisted:false}
```

Inputs topic trim1..200 and hint trim0..2000 code points. Native always sends strings; final Edge normalizes omitted/null hint to empty. Extra client categories/references/store names/actors/models/URLs never influence prompts or authority. Output requires nonempty title/body within200/40000, unique tags20x40 and category ID from caller-visible same-type current/shared categories or NULL. Source IDs retain actual text/null, not an invented UUID constraint. Sources expose only bounded metadata actually used; no content/unknown metadata/provider trace leaks to the client.

First call existing `go_kb_capabilities_v1` under caller JWT and require strict can_write. New read context RPC is SECURITY INVOKER, reuses the full current-store/fresh/existing write gate, and reads original kb_documents through caller RLS. Scope is fixed copy plus exact current store/shared NULL. Preserve legacy top5 semantic matching behavior and threshold; bound reference text for the model (maximum2000 code points/document, five documents). Do not call legacy match_kb or use service-role business reads. Verify actual vector/operator schema before adding SQL. No new table/schema rights. Categorization chooses only existing IDs/NULL, never inserts anything.

Use existing embeddings model/dimensions and completion model from the legacy endpoint, without secrets/client settings changes. Keep legacy SOP200-400/QA200-300-word style guidance and structured content, but do not fabricate price/address/policy facts or turn sales into employee assessment. Knowledge/user hints are untrusted data, not instructions that override system policy. No test makes an actual paid provider request.

External calls have bounded timeouts (embedding8s, completion30s, overall45s), strict finite1536-dimensional embedding validation, output shape/limits and errors without auto retry. Auth/current authority is checked before any provider call, before completion and before returning a candidate. Once any provider call starts, later scope/permission loss must not return the globally auto-retryable erp_scope_not_ready code: return403 `draft_scope_changed` with no candidate instead. Do not display, cache or retry the rejected candidate. This avoids automatic duplicate billing from the existing shared scope-recovery path.

Proposed errors to confirm from final source:400 invalid_params;401/403 original gates before provider;403 draft_scope_changed after provider;402 ai_budget_exhausted;429 ai_rate_limited;502 ai_unavailable/ai_invalid_response/reference_unavailable;504 ai_timeout. All are explicit failures, not an empty successful candidate. A reference lookup error is not `reference_state:none`.

## Tasks And Ownership

- [x] Independently verify original reference permissions in fixed source; freeze design DTO/error pairs. Actual new RPC schema and final implemented wire still require terminal-source review before delivery.
- [x] Lovable implemented0020 read RPC and handler/provider mocks, reports migration/Edge deployment and SQL23 forced rollback. SQL RED was not observed. R24 fixed source e564fc300f51aa072e73da7c2d1b32203603a1c5 closed independently reproduced unbounded-RPC deadline and writing-request prompt issues. No true provider or business writes.
- [x] Page worker observed RED then28 AI tests GREEN; retained38 manual receipt tests. Full candidates, stale edits, confirmation races, reserved tag, lifecycle/scope, no automatic writes and preview exclusions covered.
- [x] Main shared changes observed3RED→GREEN25, plus pre-generation lease renewal2RED→GREEN26. Ordinary freshness unchanged; post-provider scope loss never auto-retries. Final wire aligned. Git delivery remains below.
- [x] Independent native and backend review complete. Main760/full22/static23WXML+24WXSS passed; independent16 source groups＋25 extra timeout mocks closed P2. Actual synthetic GUI showed AI panel and Chinese title/hint/Markdown/tags typing. Real provider quality/employee/device acceptance remain separate.
- [x] Mini-only feature840afd5e50d6bab4f6324a645694d6806d73733d contains15 native-project paths, non-forced push and exact remote readback verified. Original Git index/Flutter checkout preserved. The source archive is a derived artifact, not mini-program publication or full-migration acceptance.

## Acceptance Commands

Run `node --test tests/api.test.cjs tests/transport.test.cjs tests/store-kb-draft-pages.test.cjs tests/store-kb-pages.test.cjs`, then every `tests/*.test.cjs` through the existing Node runner and `npm run check`. Official wcc/wcsc compile all native templates/styles. Inspect the actual editor collapsed/open panel and disabled preview action; no real AI or business write is part of agent GUI testing. Log precise gaps rather than inventing generation or adoption proof.
