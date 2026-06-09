// 公开：用户在领取页填姓名+手机 → 把 unclaimed claim 改为 claimed
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { share_token, name, phone } = await req.json().catch(() => ({}));
    if (!share_token || !name || !phone) return json({ error: '缺少必填字段' }, 400);
    if (!/^1[3-9]\d{9}$/.test(String(phone))) return json({ error: '手机号格式不正确' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: claim, error: e1 } = await admin
      .from('voucher_claims')
      .select('id, status')
      .eq('share_token', share_token)
      .maybeSingle();
    if (e1 || !claim) return json({ error: '抵用券不存在' }, 404);
    if (claim.status !== 'unclaimed') {
      // 已领取也允许重复访问；这里直接返回 ok
      return json({ ok: true, already: true });
    }
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
