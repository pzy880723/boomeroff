// 手机验证码登录：发送 OTP（白名单制）
// 仅当手机号已登记在 profiles.phone 时才发送验证码；不注册新账号、不授予任何角色。
// 冷却 / 每小时手机号与 IP 限流 / 并发原子性全部由 issue_phone_otp_v1 在数据库事务内完成。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTencentSms } from '../_shared/tencent-sms.ts';
import { clientIpHash, generateOtpCode, otpErrorResponse, sha256Hex } from '../_shared/phone-otp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PURPOSE = 'login';
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

    const startedAt = performance.now();

    // 白名单：手机号必须已登记（不创建账号）
    const { data: uid, error: eUid } = await admin.rpc('find_user_id_by_phone', { _phone: String(phone) });
    if (eUid) return otpErrorResponse('server_error', {}, corsHeaders);
    if (!uid) return otpErrorResponse('phone_not_registered', {}, corsHeaders);

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
      const c = issuedResult?.code || 'server_error';
      return otpErrorResponse(
        c,
        issuedResult?.retry_after_seconds ? { retry_after_seconds: issuedResult.retry_after_seconds } : {},
        corsHeaders,
      );
    }

    const smsResult = await sendTencentSms(String(phone), 'otp', [code]);
    if (!smsResult.ok) {
      return otpErrorResponse('sms_send_failed', {}, corsHeaders);
    }

    console.log(JSON.stringify({
      event: 'phone_login_otp_sent',
      purpose: PURPOSE,
      duration_ms: Math.round(performance.now() - startedAt),
    }));
    return new Response(JSON.stringify({
      ok: true,
      code: 'otp_issued',
      cooldown_seconds: COOLDOWN_SECONDS,
      expires_in_seconds: TTL_SECONDS,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (_e) {
    console.error('[phone-login-send-otp] unexpected error');
    return otpErrorResponse('server_error', {}, corsHeaders);
  }
});
