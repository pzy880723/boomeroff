## 问题

`ActivityDetail.tsx` 的 query:
```ts
.select('*, voucher_claim:voucher_claims!inner(status, short_code, redeemed_at)')
```
`activity_applications` 与 `voucher_claims` 之间存在 **双向外键**:
- `activity_applications.voucher_claim_id → voucher_claims.id`
- `voucher_claims.activity_application_id → activity_applications.id`

PostgREST 无法判断走哪条,`!inner` 在歧义时不返回任何行,导致领取列表永远是空。

## 修复

显式指定外键名称:

```ts
.select('*, voucher_claim:voucher_claims!activity_applications_voucher_claim_id_fkey(status, short_code, redeemed_at)')
```

并把 `!inner` 改为左连接(去掉 `!inner`),避免新插入但还没回填 `voucher_claim_id` 的瞬间也能展示(更稳健;统计已核销数仍正确,因为是按 `voucher_claim?.status` 判断)。

## 文件

- `src/pages/ActivityDetail.tsx` — 改一处 `select` 字符串。
