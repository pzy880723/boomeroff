// 管理员"直接转发"模式：基于抵用券模板生成一条 claim，返回 share_token
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) return json({ error: 'unauthorized' }, 401);
    const uid = claims.claims.sub;

    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      _user_id: uid,
      _perm: 'voucher.manage',
    });
    if (!hasPerm) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const voucher_id = body?.voucher_id;
    if (!voucher_id) return json({ error: 'voucher_id required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: voucher, error: vErr } = await admin
      .from('vouchers')
      .select('id, active')
      .eq('id', voucher_id)
      .maybeSingle();
    if (vErr || !voucher) return json({ error: 'voucher not found' }, 404);
    if (!voucher.active) return json({ error: 'voucher inactive' }, 400);

    const { data: claim, error: cErr } = await admin
      .from('voucher_claims')
      .insert({
        voucher_id,
        source: 'direct',
        status: 'unclaimed',
        created_by: uid,
        recipient_name: body?.recipient_name || null,
        recipient_phone: body?.recipient_phone || null,
      })
      .select('*')
      .single();
    if (cErr) return json({ error: cErr.message }, 400);

    return json({ ok: true, claim });
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
