// 注册手机验证码：发送 OTP（要求手机号尚未被注册）
// 用途固定为 register，与登录验证码隔离；限流与并发原子性由 issue_phone_otp_v1 完成。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTencentSms } from '../_shared/tencent-sms.ts';
import { clientIpHash, generateOtpCode, otpErrorResponse, sha256Hex } from '../_shared/phone-otp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PURPOSE = 'register';
const TTL_SECONDS = 300;
const COOLDOWN_SECONDS = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return otpErrorResponse('invalid_phone', {}, corsHeaders);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 手机号不能已被占用
    const { data: existingUid } = await admin.rpc('find_user_id_by_phone', { _phone: String(phone) });
    if (existingUid) return otpErrorResponse('phone_already_registered', {}, corsHeaders);

    const code = generateOtpCode();
    const code_hash = await sha256Hex(code);
    const ip_hash = await clientIpHash(req);

    const { data: issued, error: eIssue } = await admin.rpc('issue_phone_otp_v1', {
      _phone: String(phone),
      _purpose: PURPOSE,
      _code_hash: code_hash,
      _ip_hash: ip_hash,
      _ttl_seconds: TTL_SECONDS,
      _cooldown_seconds: COOLDOWN_SECONDS,
    });
    if (eIssue) return otpErrorResponse('server_error', {}, corsHeaders);
    const issuedResult = issued as { ok?: boolean; code?: string; retry_after_seconds?: number } | null;
    if (!issuedResult?.ok) {
      return otpErrorResponse(
        issuedResult?.code || 'server_error',
        issuedResult?.retry_after_seconds ? { retry_after_seconds: issuedResult.retry_after_seconds } : {},
        corsHeaders,
      );
    }

    const smsResult = await sendTencentSms(String(phone), 'otp', [code]);
    if (!smsResult.ok) return otpErrorResponse('sms_send_failed', {}, corsHeaders);

    return new Response(JSON.stringify({
      ok: true,
      code: 'otp_issued',
      cooldown_seconds: COOLDOWN_SECONDS,
      expires_in_seconds: TTL_SECONDS,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (_e) {
    console.error('[register-send-otp] unexpected error');
    return otpErrorResponse('server_error', {}, corsHeaders);
  }
});
