// 管理员审核活动申请：通过则生成 voucher_claim 并尝试发短信
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: aErr } = await supabase.auth.getClaims(token);
    if (aErr || !claims?.claims?.sub) return json({ error: 'unauthorized' }, 401);
    const uid = claims.claims.sub;
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      _user_id: uid,
      _perm: 'voucher.manage',
    });
    if (!hasPerm) return json({ error: 'forbidden' }, 403);

    const { application_id, decision, reject_reason } = await req.json().catch(() => ({}));
    if (!application_id || !['approve', 'reject'].includes(decision)) {
      return json({ error: 'application_id & decision required' }, 400);
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: app, error: e1 } = await admin
      .from('activity_applications')
      .select('id, status, activity_id, applicant_name, applicant_phone, activity:activities(name, voucher_id)')
      .eq('id', application_id)
      .maybeSingle();
    if (e1 || !app) return json({ error: '申请不存在' }, 404);
    if (app.status !== 'pending') return json({ error: '该申请已处理' }, 400);

    if (decision === 'reject') {
      const { error } = await admin
        .from('activity_applications')
        .update({
          status: 'rejected',
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
          reject_reason: reject_reason || null,
        })
        .eq('id', app.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // 通过：生成 claim
    const { data: claim, error: cErr } = await admin
      .from('voucher_claims')
      .insert({
        voucher_id: (app.activity as any).voucher_id,
        activity_application_id: app.id,
        source: 'activity',
        status: 'claimed',
        recipient_name: app.applicant_name,
        recipient_phone: app.applicant_phone,
        claimed_at: new Date().toISOString(),
        created_by: uid,
      })
      .select('id, code, share_token')
      .single();
    if (cErr) return json({ error: cErr.message }, 400);

    await admin
      .from('activity_applications')
      .update({
        status: 'approved',
        reviewed_by: uid,
        reviewed_at: new Date().toISOString(),
        voucher_claim_id: claim.id,
      })
      .eq('id', app.id);

    // 尝试发短信：通知短信（无变量），引导到 /q 输入手机号领取
    let smsError: string | null = null;
    try {
      const res = await supabase.functions.invoke('send-sms', {
        body: {
          phone: app.applicant_phone,
          template: 'notify',
        },
      });
      if (res.error) smsError = String(res.error.message || res.error);
      else if (res.data?.error) smsError = String(res.data.error);
    } catch (e) {
      smsError = String(e);
    }
    await admin
      .from('activity_applications')
      .update({
        sms_sent_at: smsError ? null : new Date().toISOString(),
        sms_error: smsError,
      })
      .eq('id', app.id);

    return json({ ok: true, claim, sms_error: smsError });
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
