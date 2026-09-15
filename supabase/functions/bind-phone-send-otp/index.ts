// 绑定手机号：发送 OTP（要求已登录用户）
// 用途固定为 bind，与登录/注册验证码隔离；限流与并发原子性由 issue_phone_otp_v1 完成。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTencentSms } from '../_shared/tencent-sms.ts';
import { clientIpHash, generateOtpCode, otpErrorResponse, sha256Hex } from '../_shared/phone-otp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PURPOSE = 'bind';
const TTL_SECONDS = 300;
const COOLDOWN_SECONDS = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: '请先登录', code: 'unauthenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userInfo, error: eUser } = await admin.auth.getUser(token);
    if (eUser || !userInfo?.user) {
      return new Response(JSON.stringify({ ok: false, error: '登录已失效', code: 'unauthenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const uid = userInfo.user.id;

    const { phone } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return otpErrorResponse('invalid_phone', {}, corsHeaders);
    }

    // 手机号是否被其他用户占用
    const { data: exists } = await admin.from('profiles')
      .select('user_id').eq('phone', String(phone)).neq('user_id', uid).limit(1);
    if (exists && exists.length > 0) return otpErrorResponse('phone_taken', {}, corsHeaders);

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
    console.error('[bind-phone-send-otp] unexpected error');
    return otpErrorResponse('server_error', {}, corsHeaders);
  }
});
