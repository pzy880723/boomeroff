// kb-search：前端/edge 内部调用，返回命中的品牌知识条目
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { kbSearch } from '../_shared/kb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || '').trim();
    const scope = (body?.scope || 'chat') as 'image' | 'copy' | 'video' | 'chat';
    const shopId = body?.shop_id || null;
    const k = Math.max(1, Math.min(12, Number(body?.k || 6)));
    if (!query) return new Response(JSON.stringify({ hits: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const hits = await kbSearch(admin, { query, scope, shopId, k });
    return new Response(JSON.stringify({ hits }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
