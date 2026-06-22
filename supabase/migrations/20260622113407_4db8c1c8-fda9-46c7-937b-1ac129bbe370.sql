
-- 1) 合并重复 application：每个 (activity_id, applicant_phone) 只保留最早一条
WITH ranked AS (
  SELECT id, activity_id, applicant_phone, voucher_claim_id, created_at,
         ROW_NUMBER() OVER (PARTITION BY activity_id, applicant_phone ORDER BY created_at ASC) AS rn
  FROM public.activity_applications
  WHERE applicant_phone IS NOT NULL
),
keepers AS (
  SELECT activity_id, applicant_phone, id AS keep_id, voucher_claim_id AS keep_claim
  FROM ranked WHERE rn = 1
),
dups AS (
  SELECT r.id AS dup_id, r.voucher_claim_id AS dup_claim, k.keep_id, k.keep_claim
  FROM ranked r
  JOIN keepers k
    ON k.activity_id = r.activity_id AND k.applicant_phone = r.applicant_phone
  WHERE r.rn > 1
),
-- 把多余 application 上的 claim 转移到 keeper（仅当 keeper 自己没有 claim）
moved AS (
  UPDATE public.activity_applications a
     SET voucher_claim_id = d.dup_claim
    FROM dups d
   WHERE a.id = d.keep_id
     AND a.voucher_claim_id IS NULL
     AND d.dup_claim IS NOT NULL
  RETURNING d.dup_id
),
-- 同步把 voucher_claims.activity_application_id 指向 keeper（避免外键悬空）
remap_claims AS (
  UPDATE public.voucher_claims vc
     SET activity_application_id = d.keep_id
    FROM dups d
   WHERE vc.activity_application_id = d.dup_id
  RETURNING vc.id
)
DELETE FROM public.activity_applications
 WHERE id IN (SELECT dup_id FROM dups);

-- 2) 加唯一索引（部分索引，跳过空手机号以防）
CREATE UNIQUE INDEX IF NOT EXISTS activity_applications_activity_phone_uniq
  ON public.activity_applications(activity_id, applicant_phone)
  WHERE applicant_phone IS NOT NULL;
