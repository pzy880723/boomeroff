# Activity And Voucher Management Preflight

Read-only audit at fixed GO ref2412d851859a95b733b0b1e8ee36e21f6b84dc71. No implementation, database/migration/ACL changes, live employee/customer reads, voucher/SMS mutation or paid calls were performed. This does not approve or implement the separate R27 content-home plan.

## Reachable Web Behavior

- App.tsx150-154 registers voucher/redemption/share/activity routes. ActivitiesMine62 uses voucher.manage; VouchersMine59 accepts existing manage/redeem authority. Portal review also requires voucher.manage. Template deletion additionally requires isAdmin in VoucherDetailDialog184; do not silently grant all managers deletion.
- ActivityEditDialog158 saves name/description/voucher_id/form_fields/status/requires_review/starts_at/ends_at/min_followers. UI switch writes active/draft only and keeps requires_review:false. No independent paused/closed state or review-mode editing is evidenced. Preserve existing form keys, roles and options, not a rebuilt minimal form that drops fields.
- ActivitiesMine209 deletion confirmation says applications are removed while issued vouchers remain valid. A future atomic mutation must preserve that exact ownership and consequence; status remains readable after deletion.
- VoucherEditDialog93 edits name/threshold_type/discount_amount/min_spend/valid_days/template_terms/active/starts_at/ends_at. VoucherDetailDialog73 calls voucher-claim-create then opens the share page. That Edge41-62 uses service check-then-insert without a request receipt. Existing delete RPC checks unexpired/unredeemed claims; do not replace it with direct DELETE.

## Review And Side Effects

activity-review/index.ts23 checks manage, but38-85 performs service application/claim/update steps separately. Update lacks pending CAS and approval update errors are unchecked;90-109 sends SMS and records it separately. This has concurrency/partial-success windows and no original-request reconciliation. New native support must not simply call that unsafe route and claim atomicity.

A future narrow contract needs existing fresh authority and non-NULL authorized current shop; bind application→activity→voucher.shop_id. Pending transition, exactly-once claim and private request receipt belong in one transaction. SMS is a post-commit separately recorded result: failure does not revoke approval, unknown delivery never automatically resends, and no arbitrary-phone endpoint is introduced. Preserve denial and current permissions without RLS/table grant expansion or privileged business reads.

Public activity-apply/index.ts208/232 currently auto-approves and issues a claim, returning requires_review:false. The presence of a DB field is not evidence of a mandatory manual-review flow; do not change public signup behavior as part of native employee migration.

## Next Coherent Delivery Order

1. Same-store existing voucher selection plus full activity create/edit/active-draft/delete, independent capability/CAS/original-request status and explicit consequences.
2. Voucher template maintenance and explicit direct issuance/share, retaining stricter admin deletion and existing eligibility constraints.
3. Existing pending review queue, atomic approve/reject and separate voucher/SMS result reconciliation; no new mandatory approval for current automatic public signup.
4. Native poster/share and remaining authorized administrative operations.

These remain part of full authorized-role migration; they are not implied by the existing native publication evidence or redemption pages. Backend owner coordination, fixed source review, native design/TDD/GUI and genuine business acceptance remain required for each stage.
