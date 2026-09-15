// 手机验证码共用逻辑：编码生成、IP 哈希、稳定错误码映射。
// 发码/验码的限流、原子消费均在数据库函数 issue_phone_otp_v1 / consume_phone_otp_v1 内完成。

export type OtpPurpose = 'login' | 'register' | 'bind';

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 生成 6 位验证码（服务端 CSPRNG，不可预测） */
export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

/** 取客户端 IP 并做不可逆哈希，只用于限流，不落明文 */
export async function clientIpHash(req: Request): Promise<string | null> {
  const xff = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '';
  const ip = xff.split(',')[0]?.trim();
  if (!ip) return null;
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'boomer-otp';
  return await sha256Hex(`${salt}|otp-ip|${ip}`);
}

export type OtpOutcome = { ok: boolean; code?: string; retry_after_seconds?: number; [k: string]: unknown };

const MESSAGES: Record<string, { message: string; status: number }> = {
  invalid_phone: { message: '手机号格式不正确', status: 400 },
  invalid_purpose: { message: '请求参数不正确', status: 400 },
  invalid_code_hash: { message: '请求参数不正确', status: 400 },
  otp_cooldown: { message: '验证码已发送，请稍后再试', status: 429 },
  otp_rate_limited_phone: { message: '该手机号获取验证码过于频繁，请稍后再试', status: 429 },
  otp_rate_limited_ip: { message: '当前网络请求过于频繁，请稍后再试', status: 429 },
  otp_expired: { message: '验证码已过期，请重新获取', status: 400 },
  otp_invalid: { message: '验证码不正确', status: 400 },
  otp_too_many_attempts: { message: '验证码错误次数过多，请重新获取', status: 400 },
  otp_already_used: { message: '验证码已被使用，请重新获取', status: 400 },
  phone_not_registered: { message: '该手机号尚未在系统中登记，请联系管理员', status: 404 },
  phone_already_registered: { message: '该手机号已被注册，请直接登录', status: 409 },
  phone_taken: { message: '该手机号已被其他账号占用', status: 400 },
  sms_send_failed: { message: '短信发送失败，请稍后再试', status: 400 },
  account_suspended: { message: '账号已停用，请联系管理员', status: 403 },
  server_error: { message: '服务异常，请稍后再试', status: 500 },
};

/** 把稳定错误码映射为「旧 Web 合同兼容」的响应体：error 为中文文案，附加 code / retry_after_seconds */
export function otpErrorResponse(
  code: string,
  extra: Record<string, unknown> = {},
  corsHeaders: Record<string, string> = {},
) {
  const m = MESSAGES[code] ?? MESSAGES.server_error;
  let message = m.message;
  const retry = extra.retry_after_seconds;
  if (code === 'otp_cooldown' && typeof retry === 'number') {
    message = `验证码已发送，请 ${retry} 秒后再试`;
  }
  return new Response(JSON.stringify({ ok: false, error: message, code, ...extra }), {
    status: m.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
