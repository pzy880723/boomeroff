// Worker 心跳，防止任务被超时回收
import { createClient } from 'npm:@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-token',
};
const json = (p: unknown, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const token = req.headers.get('X-Worker-Token') || '';
  const expect = Deno.env.get('XHS_WORKER_TOKEN') || '';
  if (!expect || token !== expect) return json({ error: 'unauthorized' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const application_id = String(body?.application_id || '');
    if (!application_id) return json({ error: 'application_id required' }, 400);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await sb
      .from('activity_applications')
      .update({ xhs_verify_last_at: new Date().toISOString() })
      .eq('id', application_id)
      .eq('xhs_verify_status', 'running');
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
