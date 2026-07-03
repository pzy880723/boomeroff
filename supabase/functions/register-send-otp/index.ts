// 注册手机验证码：发送 OTP（要求手机号尚未被注册）
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

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '手机号格式不正确' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 手机号不能已被占用
    const { data: existingUid } = await admin.rpc('find_user_id_by_phone', { _phone: String(phone) });
    if (existingUid) {
      return json({ error: '该手机号已被注册，请直接登录' }, 409);
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
