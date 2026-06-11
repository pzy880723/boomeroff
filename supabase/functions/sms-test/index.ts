// 后台短信测试:管理员发送 OTP + 校验
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const { action, phone, code } = body || {};

    if (action === 'send') {
      if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
        return json({ error: '手机号格式不正确' }, 400);
      }
      // 60s 限频
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: recent } = await admin.from('sms_test_otp')
        .select('id').eq('phone', String(phone)).gt('created_at', since).limit(1);
      if (recent && recent.length > 0) {
        return json({ error: '60 秒内已发送过,请稍后再试' }, 429);
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expires_at = new Date(Date.now() + 5 * 60_000).toISOString();

      // 调 send-sms
      const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ phone, template: 'otp', params: { code: otp } }),
      });
      const smsResult = await smsResp.json().catch(() => null);

      const config = {
        sdk_app_id: Deno.env.get('TENCENT_SMS_SDK_APP_ID') || null,
        sign_name: Deno.env.get('TENCENT_SMS_SIGN_NAME') || null,
        template_id: Deno.env.get('TENCENT_SMS_OTP_TEMPLATE_ID') || null,
      };

      if (!smsResp.ok) {
        // 仍然记录失败,便于追溯
        await admin.from('sms_test_otp').insert({
          phone: String(phone), code: otp, expires_at,
          created_by: user.id, tencent_response: smsResult,
        });
        return json({ ok: false, error: smsResult?.error || '短信发送失败', detail: smsResult, config }, 400);
      }

      await admin.from('sms_test_otp').insert({
        phone: String(phone), code: otp, expires_at,
        created_by: user.id, tencent_response: smsResult,
      });

      return json({ ok: true, detail: smsResult, config });
    }

    if (action === 'verify') {
      if (!phone || !code) return json({ error: '请输入手机号和验证码' }, 400);
      const { data: rec } = await admin.from('sms_test_otp')
        .select('id, code, expires_at, consumed_at')
        .eq('phone', String(phone))
        .eq('created_by', user.id)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!rec) return json({ ok: false, reason: 'not_found', message: '未找到验证码,请先发送' });
      if (new Date(rec.expires_at).getTime() < Date.now()) {
        return json({ ok: false, reason: 'expired', message: '验证码已过期' });
      }
      if (String(rec.code) !== String(code).trim()) {
        return json({ ok: false, reason: 'mismatch', message: '验证码错误' });
      }
      await admin.from('sms_test_otp').update({ consumed_at: new Date().toISOString() }).eq('id', rec.id);
      return json({ ok: true, message: '验证通过' });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
