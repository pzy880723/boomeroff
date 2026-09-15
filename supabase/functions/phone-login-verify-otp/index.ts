// 手机验证码登录：校验 OTP 并直接返回会话，避免客户端再发一次跨境 Auth 请求。
// 验证码消费走 consume_phone_otp_v1：行锁 + used_at 条件更新，同一个码并发只可能成功一次；
// 校验失败时 attempts 原子递增。用途固定为 login，与注册/绑定验证码隔离。
// 本接口不创建账号、不授予角色，只为已登记手机号签发会话。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { otpErrorResponse, sha256Hex } from '../_shared/phone-otp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PURPOSE = 'login';
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone, code } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return otpErrorResponse('invalid_phone', {}, corsHeaders);
    }
    if (!code || !/^\d{6}$/.test(String(code))) {
      return otpErrorResponse('otp_invalid', {}, corsHeaders);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const startedAt = performance.now();
    const { data: uid } = await admin.rpc('find_user_id_by_phone', { _phone: String(phone) });
    if (!uid) return otpErrorResponse('phone_not_registered', {}, corsHeaders);

    const codeHash = await sha256Hex(String(code));
    const { data: consumed, error: eConsume } = await admin.rpc('consume_phone_otp_v1', {
      _phone: String(phone),
      _purpose: PURPOSE,
      _code_hash: codeHash,
      _max_attempts: MAX_ATTEMPTS,
    });
    if (eConsume) return otpErrorResponse('server_error', {}, corsHeaders);
    const result = consumed as { ok?: boolean; code?: string; attempts_left?: number } | null;
    if (!result?.ok) {
      const c = result?.code || 'otp_invalid';
      return otpErrorResponse(
        c,
        typeof result?.attempts_left === 'number' ? { attempts_left: result.attempts_left } : {},
        corsHeaders,
      );
    }

    // 用 admin 生成 magic link，让前端拿 token 完成会话
    const { data: userInfo, error: eUser } = await admin.auth.admin.getUserById(String(uid));
    if (eUser || !userInfo?.user?.email) return otpErrorResponse('server_error', {}, corsHeaders);

    const { data: link, error: eLink } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userInfo.user.email,
    });
    if (eLink || !link?.properties?.hashed_token) {
      return otpErrorResponse('server_error', {}, corsHeaders);
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    });
    if (verifyError || !verified.session) {
      return otpErrorResponse('server_error', {}, corsHeaders);
    }

    // 历史 ERP 账号只把手机号写进 profiles。验证码验证成功后同步 Auth，
    // 保持账号唯一性数据一致，并为后续启用原生手机登录做好准备。
    const normalizedPhone = String(phone);
    if (userInfo.user.phone !== normalizedPhone) {
      const { error: phoneSyncError } = await admin.auth.admin.updateUserById(String(uid), {
        phone: normalizedPhone,
        phone_confirm: true,
      });
      if (phoneSyncError) console.error('[phone-login] auth phone sync failed');
    }

    console.log(JSON.stringify({
      event: 'phone_login_otp_verified',
      purpose: PURPOSE,
      duration_ms: Math.round(performance.now() - startedAt),
    }));

    return new Response(JSON.stringify({
      ok: true,
      code: 'login_ok',
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
      expires_in: verified.session.expires_in,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (_e) {
    console.error('[phone-login-verify-otp] unexpected error');
    return otpErrorResponse('server_error', {}, corsHeaders);
  }
});
