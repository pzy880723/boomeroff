// 公开：凭 activity share_token 读取活动信息（不返回敏感字段）
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const share_token = url.searchParams.get('share_token') || (await req.json().catch(() => ({})))?.share_token;
    if (!share_token) return json({ error: 'share_token required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: a, error } = await admin
      .from('activities')
      .select('id, name, description, cover_url, form_fields, status, starts_at, ends_at, voucher:vouchers(name, threshold_type, discount_amount, min_spend, valid_days, template_terms)')
      .eq('share_token', share_token)
      .maybeSingle();
    if (error || !a) return json({ error: '活动不存在' }, 404);

    return json({ ok: true, activity: a });
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
