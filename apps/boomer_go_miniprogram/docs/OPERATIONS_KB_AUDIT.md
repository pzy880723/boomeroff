# Current-store SOP And QA Migration Audit

Read-only fixed GO source: `42984c7ae027a2086ecd93fc05bfdcf35122d1fa`, get_project confirmed finished. Independent reviewer inspected the actual Web routes/components/migrations, not business rows. This is the next missing workflow; no operational write was performed.

## Existing Employee Functionality

- `src/pages/Me.tsx:249-256` exposes /me/sop and /me/qa.
- `MySop.tsx:144-163,193-270` and `MyQa.tsx:80-101,129-206` allow existing `shop.kb.write` users to create/edit/delete entries and request AI drafts. Ordinary readers do not gain this permission.
- Standalone category CRUD/order belongs to Portal `KbManager` rather than these employee pages. Its actual category write permission is `shop.kb.category`, distinct from `shop.kb.write`, even though Portal mounts the component using the latter.

## Actual Data And Authority

Tables are `shop_kb_entries` and `shop_kb_categories`, each with nullable shop_id. Entry fields: type/category_id/title/body/tags/sort_order/created_by/updated_at. Deleting a category nulls the entry's category_id, not the entry itself.

Relevant sources:
- `supabase/migrations/20260514032532_592d1a36-ea97-4707-874c-856d1054d36e.sql:74-107` defines the tables; `20260514035807_c6c0fc1b-7564-4edf-8ace-4383d88a3797.sql:36-37` adds scope.
- `20260907172958_56cd4864-1dd8-41b5-9393-c7c0fd458ede.sql:410-432`: entry CRUD uses can_write_scoped(shop_id,'shop.kb.write'); category CRUD uses shop.kb.category.
- `20260907173829_82af3b8e-aeac-472c-ba14-66f38733409b.sql:25-43,60-82`: ERP-governed paths require actual ERP action authority; role names alone do not authorize writes. Current can_write_scoped accepts NULL scope.
- `20260915004052_8d4f01ed-721a-41b8-a0dc-86e71115a323.sql:1-17,80-95` adds restrictive authority checks to both tables.

## Do Not Copy These Legacy Faults

1. Employee create payloads omit shop_id, accidentally creating shared NULL-scope content where existing authority permits. Native writes must explicitly bind the current non-NULL store. Shared entries remain read-only in this workflow.
2. `generate-shop-kb/index.ts:15,38-40` accepts client shop_id and uses service-role knowledge retrieval without explicit getUser/fresh scope/action/store checks. A gateway JWT check alone does not establish employee authority. Reuse prompts/output shape only after caller-JWT scope/permission review; do not directly reuse its privileged read path.
3. Web AI drafting creates a category before the user saves the draft. It therefore has an unexpected side effect and can fail for entry writers without category permission. Native draft preparation must not auto-create a category or grant category rights.
4. Current go-mini knowledge-detail SOP/QA branch selects by id under authorized-set RLS without exact selected-store filtering. This is not an RLS bypass, but does not enforce the native current-store requirement for a multi-store authorized identity. Narrow it to selected store plus explicitly read-only shared content before native maintenance.

## Next Complete Workflow

Current-store SOP/QA list/category/read -> existing explicit capability -> manually create/edit title/body/tags/existing category -> explicit save/delete -> exact server receipt and readback. Use narrow caller-JWT BFF actions, existing fresh ERP gate, exact shop/type/id and existing write permission. No new table grant, role expansion or service-role business read. AI drafting belongs to the same full migration but must be separately repaired for caller authority and no pre-save side effects. Category administration/official knowledge management remain distinct required legacy surfaces, not falsely counted by this first maintenance workflow.

This audit does not prove current deployment, write permissions of any employee, migration application, SQL execution, AI output or real-device acceptance.
