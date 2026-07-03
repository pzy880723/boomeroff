// 绑定手机号：校验 OTP 并写入当前登录用户
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
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: '请先登录' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userInfo, error: eUser } = await admin.auth.getUser(token);
    if (eUser || !userInfo?.user) return json({ error: '登录已失效' }, 401);
    const uid = userInfo.user.id;

    const { phone, code } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '手机号格式不正确' }, 400);
    }
    if (!code || !/^\d{6}$/.test(String(code))) {
      return json({ error: '请输入 6 位验证码' }, 400);
    }

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

    await admin.from('phone_login_otp').update({ used_at: new Date().toISOString() }).eq('id', otp.id);

    // 唯一性再校验
    const { data: exists } = await admin.from('profiles')
      .select('user_id').eq('phone', String(phone)).neq('user_id', uid).limit(1);
    if (exists && exists.length > 0) return json({ error: '该手机号已被其他账号占用' }, 400);

    const { error: eUpd } = await admin.from('profiles')
      .update({ phone: String(phone), updated_at: new Date().toISOString() })
      .eq('user_id', uid);
    if (eUpd) return json({ error: eUpd.message }, 400);

    return json({ ok: true });
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
