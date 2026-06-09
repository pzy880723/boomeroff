// 公开：凭 share_token 或 (code+phone) 查询 claim 状态
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const share_token = body?.share_token as string | undefined;
    const code = body?.code as string | undefined;
    const phone = body?.phone as string | undefined;
    if (!share_token && !(code && phone)) {
      return json({ error: 'share_token or code+phone required' }, 400);
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    let q = admin
      .from('voucher_claims')
      .select('id, code, share_token, status, source, recipient_name, recipient_phone, claimed_at, expires_at, redeemed_at, voucher:vouchers(id, name, threshold_type, discount_amount, min_spend, valid_days, template_terms)')
      .limit(1);
    if (share_token) q = q.eq('share_token', share_token);
    else q = q.eq('code', code!).eq('recipient_phone', phone!);
    const { data, error } = await q.maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: 'not found' }, 404);

    // 自动过期标记（只读返回，不写库）
    if (data.status === 'claimed' && data.expires_at && new Date(data.expires_at) < new Date()) {
      data.status = 'expired';
    }
    return json({ ok: true, claim: data });
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
