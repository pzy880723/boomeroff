// 状态文案与颜色（中文）
export const VOUCHER_STATUS_LABEL: Record<string, string> = {
  pending_apply: '待客户申请',
  pending_review: '待审核',
  approved: '已发放',
  rejected: '已拒绝',
  redeemed: '已核销',
  expired: '已过期',
  revoked: '已撤销',
};

export const VOUCHER_STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_apply: 'outline',
  pending_review: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  redeemed: 'secondary',
  expired: 'outline',
  revoked: 'destructive',
};

export interface VoucherType {
  id: string;
  name: string;
  description: string | null;
  face_value: number;
  valid_days: number;
  terms: string | null;
  active: boolean;
  sort_order: number;
}

export interface Voucher {
  id: string;
  code: string;
  type_id: string | null;
  created_by: string | null;
  share_token: string;
  status: string;
  note: string | null;
  applicant_name: string | null;
  applicant_phone: string | null;
  applicant_screenshot_url: string | null;
  applicant_submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
  voucher_types?: VoucherType | null;
}

// 生成给客户的分享链接 / 二维码 URL
export function buildVoucherShareUrl(share_token: string): string {
  return `${window.location.origin}/u/voucher/${share_token}`;
}

// 生成给店员的核销 URL（QR 内容）
export function buildVoucherRedeemUrl(code: string, share_token: string): string {
  return `${window.location.origin}/me/vouchers/redeem/${code}?t=${share_token}`;
}
