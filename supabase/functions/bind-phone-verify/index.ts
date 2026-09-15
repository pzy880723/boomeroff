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

    const codeHash = await sha256Hex(String(code));
    const { data: consumed, error: eConsume } = await admin.rpc('consume_phone_otp_v1', {
      _phone: String(phone),
      _purpose: 'bind',
      _code_hash: codeHash,
      _max_attempts: 5,
    });
    if (eConsume) return json({ error: '服务异常，请稍后再试', code: 'server_error' }, 500);
    const consumeResult = consumed as { ok?: boolean; code?: string } | null;
    if (!consumeResult?.ok) {
      const c = consumeResult?.code || 'otp_invalid';
      const msg = c === 'otp_expired' ? '验证码已过期，请重新获取'
        : c === 'otp_too_many_attempts' ? '验证码错误次数过多，请重新获取'
        : c === 'otp_already_used' ? '验证码已被使用，请重新获取'
        : '验证码不正确';
      return json({ error: msg, code: c }, 400);
    }

    // 唯一性再校验
    const { data: exists } = await admin.from('profiles')
      .select('user_id').eq('phone', String(phone)).neq('user_id', uid).limit(1);
    if (exists && exists.length > 0) return json({ error: '该手机号已被其他账号占用' }, 400);

    const { error: authPhoneError } = await admin.auth.admin.updateUserById(uid, {
      phone: String(phone),
      phone_confirm: true,
    });
    if (authPhoneError) return json({ error: authPhoneError.message }, 400);

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
