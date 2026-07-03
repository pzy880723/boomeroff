// 绑定手机号：发送 OTP（要求已登录用户）
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

    const { phone } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '手机号格式不正确' }, 400);
    }

    // 手机号是否被其他用户占用
    const { data: exists } = await admin.from('profiles')
      .select('user_id').eq('phone', String(phone)).neq('user_id', uid).limit(1);
    if (exists && exists.length > 0) {
      return json({ error: '该手机号已被其他账号占用' }, 400);
    }

    // 60s 限流
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin.from('phone_login_otp')
      .select('id').eq('phone', String(phone)).gt('created_at', since).limit(1);
    if (recent && recent.length > 0) {
      return json({ error: '验证码已发送，请 60 秒后再试' }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256Hex(code);
    const expires_at = new Date(Date.now() + 5 * 60_000).toISOString();
    const { error: e2 } = await admin.from('phone_login_otp').insert({
      phone: String(phone), code_hash, expires_at,
    });
    if (e2) return json({ error: e2.message }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ phone, template: 'otp', params: { code } }),
    }).catch(() => null);
    const smsResult = smsResp ? await smsResp.json().catch(() => null) : null;
    if (!smsResp || !smsResp.ok) {
      return json({ error: smsResult?.message || '短信发送失败，请稍后再试' }, 400);
    }

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
