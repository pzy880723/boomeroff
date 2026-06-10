// 抵用券与活动相关常量与类型

export const CLAIM_STATUS_LABEL: Record<string, string> = {
  unclaimed: '待领取',
  claimed: '已领取',
  redeemed: '已核销',
  expired: '已过期',
  void: '已作废',
};

export const CLAIM_STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  unclaimed: 'outline',
  claimed: 'default',
  redeemed: 'secondary',
  expired: 'outline',
  void: 'destructive',
};

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

export const APPLICATION_STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

// 抵用券模板
export interface VoucherTemplate {
  id: string;
  name: string;
  threshold_type: 'none' | 'min_spend';
  discount_amount: number;
  min_spend: number | null;
  valid_days: number;
  template_terms: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

// 实例：每张领取/核销的券
export interface VoucherClaim {
  id: string;
  voucher_id: string;
  activity_application_id: string | null;
  code: string;
  share_token: string;
  short_code: string | null;
  source: 'direct' | 'activity';
  status: 'unclaimed' | 'claimed' | 'redeemed' | 'expired' | 'void';
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_extra: Record<string, unknown>;
  claimed_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  created_by: string | null;
  created_at: string;
}

// 活动表单字段定义
export interface ActivityField {
  key: string;
  label: string;
  type: 'text' | 'phone' | 'url' | 'image' | 'textarea' | 'select';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface Activity {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  voucher_id: string;
  share_token: string;
  form_fields: ActivityField[];
  status: 'draft' | 'active' | 'closed';
  max_applications: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ActivityApplication {
  id: string;
  activity_id: string;
  applicant_name: string;
  applicant_phone: string;
  form_data: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  voucher_claim_id: string | null;
  sms_sent_at: string | null;
  sms_error: string | null;
  created_at: string;
}

// 描述抵用券抵扣规则的中文
export function formatVoucherRule(v: Pick<VoucherTemplate, 'threshold_type' | 'discount_amount' | 'min_spend'>): string {
  if (v.threshold_type === 'min_spend') {
    return `满 ¥${v.min_spend ?? 0} 抵 ¥${v.discount_amount}`;
  }
  return `无门槛抵 ¥${v.discount_amount}`;
}

// 公开领取短链（优先 short_code，回退 share_token）
export function buildClaimShareUrl(token: string): string {
  return `${window.location.origin}/u/c/${token}`;
}

// 活动公开申请链接
export function buildActivityShareUrl(share_token: string): string {
  return `${window.location.origin}/u/activity/${share_token}`;
}

// 店员核销 URL（QR 内容）
export function buildClaimRedeemUrl(code: string): string {
  return `${window.location.origin}/me/vouchers/redeem/${code}`;
}

export const VOUCHER_STATUS_LABEL = CLAIM_STATUS_LABEL;
export const VOUCHER_STATUS_VARIANT = CLAIM_STATUS_VARIANT;
