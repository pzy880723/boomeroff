// 店员核销：输入 code，将 claimed 改为 redeemed
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
      _perm: 'voucher.redeem',
    });
    if (!hasPerm) return json({ error: 'forbidden' }, 403);

    const { code } = await req.json().catch(() => ({}));
    if (!code) return json({ error: 'code required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: claim, error: e1 } = await admin
      .from('voucher_claims')
      .select('id, status, expires_at, voucher:vouchers(name, discount_amount)')
      .eq('code', String(code).toUpperCase())
      .maybeSingle();
    if (e1 || !claim) return json({ error: '券码不存在' }, 404);
    if (claim.status === 'redeemed') return json({ error: '该券已核销' }, 400);
    if (claim.status === 'void') return json({ error: '该券已作废' }, 400);
    if (claim.status === 'unclaimed') return json({ error: '客户尚未领取' }, 400);
    if (claim.expires_at && new Date(claim.expires_at) < new Date()) {
      return json({ error: '该券已过期' }, 400);
    }
    const { error: e2 } = await admin
      .from('voucher_claims')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_by: uid })
      .eq('id', claim.id);
    if (e2) return json({ error: e2.message }, 400);
    return json({ ok: true, voucher: claim.voucher });
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
