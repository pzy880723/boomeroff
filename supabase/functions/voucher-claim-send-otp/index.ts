// 公开：用户填手机号 → 生成 6 位 OTP 并通过 send-sms 发送
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { share_token, short_code, phone, name } = await req.json().catch(() => ({}));
    if (!(share_token || short_code) || !phone || !name) {
      return json({ error: '缺少必填字段' }, 400);
    }
    if (!/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '手机号格式不正确' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let q = admin.from('voucher_claims')
      .select('id, status, share_token, short_code, voucher_id')
      .limit(1);
    if (short_code) q = q.eq('short_code', String(short_code).toUpperCase());
    else q = q.eq('share_token', share_token);
    const { data: claim, error: e1 } = await q.maybeSingle();
    if (e1 || !claim) return json({ error: '抵用券不存在' }, 404);
    if (claim.status !== 'unclaimed') return json({ error: '该券已被领取或失效' }, 400);

    // 60s 内同一手机不能重复发
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin.from('claim_otp')
      .select('id, created_at')
      .eq('phone', String(phone))
      .gt('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      return json({ error: '验证码已发送，请稍后再试' }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires_at = new Date(Date.now() + 5 * 60_000).toISOString();
    const { error: e2 } = await admin.from('claim_otp').insert({
      claim_id: claim.id,
      phone: String(phone),
      code,
      expires_at,
    });
    if (e2) return json({ error: e2.message }, 400);

    // 调 send-sms（OTP 模板：{1}=验证码）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        phone,
        template: 'otp',
        params: { code },
      }),
    }).catch(() => null);
    const smsResult = smsResp ? await smsResp.json().catch(() => null) : null;
    if (!smsResp || !smsResp.ok) {
      const reason = smsResult?.error === 'sms_not_configured'
        ? 'sms_unavailable'
        : (smsResult?.error || '短信发送失败，请联系店员手动核销');
      return json({ ok: false, error: reason, message: smsResult?.message }, 400);
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
