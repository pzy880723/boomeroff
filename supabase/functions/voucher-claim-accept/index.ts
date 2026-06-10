// 公开：用户填姓名+手机+验证码 → 校验 OTP 后把 claim 改为 claimed
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { share_token, short_code, name, phone, otp } = await req.json().catch(() => ({}));
    if (!(share_token || short_code) || !name || !phone || !otp) {
      return json({ error: '缺少必填字段' }, 400);
    }
    if (!/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '手机号格式不正确' }, 400);
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return json({ error: '验证码格式不正确' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let q = admin.from('voucher_claims').select('id, status').limit(1);
    if (short_code) q = q.eq('short_code', String(short_code).toUpperCase());
    else q = q.eq('share_token', share_token);
    const { data: claim, error: e1 } = await q.maybeSingle();
    if (e1 || !claim) return json({ error: '抵用券不存在' }, 404);
    if (claim.status !== 'unclaimed') return json({ ok: true, already: true });

    const { data: otpRow } = await admin.from('claim_otp')
      .select('*')
      .eq('claim_id', claim.id)
      .eq('phone', String(phone))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!otpRow) return json({ error: '请先获取验证码' }, 400);
    if (otpRow.verified_at) return json({ error: '验证码已使用，请重新获取' }, 400);
    if (new Date(otpRow.expires_at) < new Date()) return json({ error: '验证码已过期' }, 400);
    if ((otpRow.attempts ?? 0) >= 5) return json({ error: '验证次数过多，请重新获取' }, 400);

    if (String(otp) !== String(otpRow.code)) {
      await admin.from('claim_otp').update({ attempts: (otpRow.attempts ?? 0) + 1 }).eq('id', otpRow.id);
      return json({ error: '验证码不正确' }, 400);
    }

    await admin.from('claim_otp').update({ verified_at: new Date().toISOString() }).eq('id', otpRow.id);

    const { error: e2 } = await admin
      .from('voucher_claims')
      .update({
        status: 'claimed',
        recipient_name: String(name).slice(0, 50),
        recipient_phone: String(phone),
        claimed_at: new Date().toISOString(),
      })
      .eq('id', claim.id);
    if (e2) return json({ error: e2.message }, 400);
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
