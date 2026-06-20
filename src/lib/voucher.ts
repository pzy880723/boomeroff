// 优惠券与活动相关常量与类型

export const CLAIM_STATUS_LABEL: Record<string, string> = {
  claimed: '待核销',
  redeemed: '已核销',
  expired: '已过期',
  void: '已作废',
};

export const CLAIM_STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
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

// 优惠券模板
export interface VoucherTemplate {
  id: string;
  name: string;
  threshold_type: 'none' | 'min_spend';
  discount_amount: number;
  min_spend: number | null;
  valid_days: number;
  template_terms: string | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
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
  status: 'claimed' | 'redeemed' | 'expired' | 'void';
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
  requires_review: boolean;
  max_applications: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  poster_url?: string | null;
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
  publish_confirmed?: boolean | null;
  publish_confirmed_at?: string | null;
  publish_confirmed_by?: string | null;
  publish_confirm_note?: string | null;
  publish_screenshots?: string[] | null;
}

// 描述优惠券抵扣规则的中文
export function formatVoucherRule(v: Pick<VoucherTemplate, 'threshold_type' | 'discount_amount' | 'min_spend'>): string {
  if (v.threshold_type === 'min_spend') {
    return `满 ¥${v.min_spend ?? 0} 抵 ¥${v.discount_amount}`;
  }
  return `无门槛抵 ¥${v.discount_amount}`;
}

// 公开领取短链（优先 short_code，回退 share_token）
import { getPublicBaseUrl } from './publicBaseUrl';

export function buildClaimShareUrl(token: string): string {
  return `${getPublicBaseUrl()}/u/c/${token}`;
}

// 活动公开申请链接
export function buildActivityShareUrl(share_token: string): string {
  return `${getPublicBaseUrl()}/u/activity/${share_token}`;
}

// 店员核销 URL（QR 内容）
export function buildClaimRedeemUrl(code: string): string {
  return `${getPublicBaseUrl()}/me/vouchers/redeem/${code}`;
}

export const VOUCHER_STATUS_LABEL = CLAIM_STATUS_LABEL;
export const VOUCHER_STATUS_VARIANT = CLAIM_STATUS_VARIANT;

// 有效期范围 + 剩余天数（基于 claim 的 claimed_at / expires_at）
export interface ValidityInfo {
  rangeText: string;
  remainingText: string;
  expired: boolean;
}

export function formatValidityRange(
  claim: { claimed_at: string | null; expires_at: string | null; status: string },
  fallbackDays?: number,
): ValidityInfo {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (!claim.expires_at) {
    return {
      rangeText: fallbackDays ? `领取后 ${fallbackDays} 天内有效` : '领取后生效',
      remainingText: '',
      expired: false,
    };
  }

  const expires = new Date(claim.expires_at);
  const start = claim.claimed_at ? new Date(claim.claimed_at) : null;
  const rangeText = start ? `${fmt(start)} ~ ${fmt(expires)}` : `有效期至 ${fmt(expires)}`;

  const now = Date.now();
  const diffMs = expires.getTime() - now;
  const expired = diffMs <= 0 || claim.status === 'expired';

  let remainingText = '';
  if (expired) {
    const days = Math.floor((now - expires.getTime()) / 86400000);
    remainingText = days <= 0 ? '已过期' : `已过期 ${days} 天`;
  } else {
    const days = Math.floor(diffMs / 86400000);
    if (days >= 1) remainingText = `剩 ${days} 天`;
    else {
      const hours = Math.max(1, Math.ceil(diffMs / 3600000));
      remainingText = `剩 ${hours} 小时`;
    }
  }
  return { rangeText, remainingText, expired };
}


export type ActivityTimeStatus = 'not_started' | 'ongoing' | 'ended';

export interface ActivityTimeInfo {
  status: ActivityTimeStatus;
  label: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  countdown?: string;
}

export function getActivityTimeInfo(a: Activity): ActivityTimeInfo {
  const now = Date.now();
  const starts = a.starts_at ? new Date(a.starts_at).getTime() : null;
  const ends = a.ends_at ? new Date(a.ends_at).getTime() : null;

  if (starts !== null && now < starts) {
    const diff = starts - now;
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    let countdown: string | undefined;
    if (days >= 3) countdown = `距开始 ${days} 天`;
    else if (days >= 1) countdown = `距开始 ${days} 天 ${hours % 24} 小时`;
    else if (hours >= 1) countdown = `距开始 ${hours} 小时`;
    else countdown = `距开始 ${Math.max(1, Math.ceil(diff / 60000))} 分钟`;
    return { status: 'not_started', label: '未开始', badgeVariant: 'secondary', countdown };
  }

  if (ends !== null && now >= ends) {
    return { status: 'ended', label: '已结束', badgeVariant: 'destructive' };
  }

  if (ends !== null && now < ends) {
    const diff = ends - now;
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    let countdown: string | undefined;
    if (days >= 3) countdown = `剩 ${days} 天`;
    else if (days >= 1) countdown = `剩 ${days} 天 ${hours % 24} 小时`;
    else if (hours >= 1) countdown = `剩 ${hours} 小时`;
    else countdown = `剩 ${Math.max(1, Math.ceil(diff / 60000))} 分钟`;
    return { status: 'ongoing', label: '进行中', badgeVariant: 'default', countdown };
  }

  // 无明确时间范围时按 status fallback
  if (a.status === 'draft') return { status: 'not_started', label: '草稿', badgeVariant: 'outline' };
  if (a.status === 'closed') return { status: 'ended', label: '已关闭', badgeVariant: 'destructive' };
  return { status: 'ongoing', label: '进行中', badgeVariant: 'default' };
}

export type VoucherTemplateStatus = 'pending' | 'active' | 'ended';

export interface VoucherTemplateTimeInfo {
  status: VoucherTemplateStatus;
  label: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  rangeText: string;
  countdown?: string;
}

export function getVoucherTemplateTimeInfo(
  v: Pick<VoucherTemplate, 'starts_at' | 'ends_at' | 'active'>,
): VoucherTemplateTimeInfo {
  const fmt = (s: string) => {
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const now = Date.now();
  const starts = v.starts_at ? new Date(v.starts_at).getTime() : null;
  const ends = v.ends_at ? new Date(v.ends_at).getTime() : null;
  const rangeText =
    starts || ends
      ? `${v.starts_at ? fmt(v.starts_at) : '不限'} ~ ${v.ends_at ? fmt(v.ends_at) : '不限'}`
      : '长期有效';

  const diffText = (ms: number, prefix: string) => {
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor(ms / 3600000);
    if (days >= 3) return `${prefix} ${days} 天`;
    if (days >= 1) return `${prefix} ${days} 天 ${hours % 24} 小时`;
    if (hours >= 1) return `${prefix} ${hours} 小时`;
    return `${prefix} ${Math.max(1, Math.ceil(ms / 60000))} 分钟`;
  };

  if (starts !== null && now < starts) {
    return {
      status: 'pending',
      label: '待生效',
      badgeVariant: 'secondary',
      rangeText,
      countdown: diffText(starts - now, '距开始'),
    };
  }
  if (ends !== null && now >= ends) {
    return { status: 'ended', label: '已结束', badgeVariant: 'destructive', rangeText };
  }
  return {
    status: 'active',
    label: '已生效',
    badgeVariant: 'default',
    rangeText,
    countdown: ends !== null ? diffText(ends - now, '剩') : undefined,
  };
}

