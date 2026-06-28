// 公开：活动报名 - 发送手机号验证码
// 1) 校验活动有效 + 手机号格式
// 2) 若该手机已报名过该活动，直接返回 already=true，不发短信
// 3) 60s 节流，写 OTP 后调用 send-sms（otp 模板）
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { share_token, phone } = await req.json().catch(() => ({}));
    if (!share_token || !phone) return json({ error: '缺少必填字段' }, 400);
    const phoneStr = String(phone).trim();
    if (!/^1[3-9]\d{9}$/.test(phoneStr)) return json({ error: '手机号格式不正确' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: activity, error: aErr } = await admin
      .from('activities')
      .select('id, status, ends_at')
      .eq('share_token', share_token)
      .maybeSingle();
    if (aErr || !activity) return json({ error: '活动不存在' }, 404);
    if (activity.status !== 'active') return json({ error: '活动已结束' }, 400);
    if (activity.ends_at && new Date(activity.ends_at) < new Date()) {
      return json({ error: '活动已结束' }, 400);
    }

    // 已报名 → 直接返回已有 short_code，不发短信
    const { data: existed } = await admin
      .from('activity_applications')
      .select('id, voucher_claim:voucher_claims(short_code)')
      .eq('activity_id', activity.id)
      .eq('applicant_phone', phoneStr)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existed) {
      const sc = (existed as any)?.voucher_claim?.short_code || null;
      return json({ ok: true, already: true, short_code: sc });
    }

    // 60s 节流
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin
      .from('activity_apply_otp')
      .select('id')
      .eq('activity_id', activity.id)
      .eq('phone', phoneStr)
      .gt('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      return json({ error: '验证码已发送，请 1 分钟后重试' }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires_at = new Date(Date.now() + 5 * 60_000).toISOString();
    const { error: e2 } = await admin.from('activity_apply_otp').insert({
      activity_id: activity.id,
      phone: phoneStr,
      code,
      expires_at,
    });
    if (e2) return json({ error: e2.message }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ phone: phoneStr, template: 'otp', params: { code } }),
    }).catch(() => null);
    const smsResult = smsResp ? await smsResp.json().catch(() => null) : null;
    if (!smsResp || !smsResp.ok) {
      const reason = smsResult?.error === 'sms_not_configured'
        ? '短信服务未配置，请联系店员'
        : (smsResult?.message || smsResult?.error || '短信发送失败，请稍后重试');
      return json({ ok: false, error: reason }, 400);
    }

    return json({ ok: true, expires_in: 300 });
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
