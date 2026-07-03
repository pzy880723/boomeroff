// 手机验证码登录：校验 OTP 并返回一次性 magic link，供前端调 verifyOtp 登录
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256Hex(s: string) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone, code } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '手机号格式不正确' }, 400);
    }
    if (!code || !/^\d{6}$/.test(String(code))) {
      return json({ error: '请输入 6 位验证码' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: uid } = await admin.rpc('find_user_id_by_phone', { _phone: String(phone) });
    if (!uid) return json({ error: '该手机号尚未在系统中登记' }, 404);

    // 找最新 5 分钟内、未使用的验证码
    const { data: otps } = await admin.from('phone_login_otp')
      .select('id, code_hash, expires_at, used_at, attempts')
      .eq('phone', String(phone))
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    const otp = otps?.[0];
    if (!otp) return json({ error: '验证码已过期，请重新获取' }, 400);
    if (otp.attempts >= 5) return json({ error: '验证码错误次数过多，请重新获取' }, 400);

    const codeHash = await sha256Hex(String(code));
    if (codeHash !== otp.code_hash) {
      await admin.from('phone_login_otp').update({ attempts: (otp.attempts || 0) + 1 }).eq('id', otp.id);
      return json({ error: '验证码不正确' }, 400);
    }

    // 标记已使用
    await admin.from('phone_login_otp').update({ used_at: new Date().toISOString() }).eq('id', otp.id);

    // 用 admin 生成 magic link，让前端拿 token 完成会话
    const { data: userInfo, error: eUser } = await admin.auth.admin.getUserById(String(uid));
    if (eUser || !userInfo?.user?.email) return json({ error: '账号数据异常' }, 500);

    const { data: link, error: eLink } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userInfo.user.email,
    });
    if (eLink || !link?.properties?.hashed_token) {
      return json({ error: eLink?.message || '登录票据生成失败' }, 500);
    }

    return json({
      ok: true,
      email: userInfo.user.email,
      token_hash: link.properties.hashed_token,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
