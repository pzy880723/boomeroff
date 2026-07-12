// Worker 回写小红书发文核查结果
// body: {application_id, verified: true, note_title, author_profile_url, published_at?, matched_keywords?}
//    or {application_id, verified: false, reason: 'author_mismatch'|'not_found'|'no_keyword'|'cookie_expired'|'failed', message?}
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
    const verified = !!body?.verified;
    const reason = String(body?.reason || '');

    let status = 'failed';
    if (verified) status = 'verified';
    else if (reason === 'not_found') status = 'not_found';
    else if (reason === 'author_mismatch' || reason === 'no_keyword') status = 'mismatch';
    else if (reason === 'cookie_expired') status = 'failed';

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await sb
      .from('activity_applications')
      .update({
        xhs_verify_status: status,
        xhs_verify_last_at: new Date().toISOString(),
        xhs_verify_result: {
          verified,
          reason: reason || null,
          message: body?.message ?? null,
          note_title: body?.note_title ?? null,
          author_profile_url: body?.author_profile_url ?? null,
          published_at: body?.published_at ?? null,
          matched_keywords: body?.matched_keywords ?? null,
          received_at: new Date().toISOString(),
        },
      })
      .eq('id', application_id);
    if (error) return json({ error: error.message }, 500);

    // Cookie 失效时记一条 app_settings 状态，管理端可显示
    if (reason === 'cookie_expired') {
      await sb.from('app_settings').upsert({
        key: 'xhs_worker_cookie_status',
        value: JSON.stringify({ status: 'expired', at: new Date().toISOString() }),
      });
    } else if (verified) {
      await sb.from('app_settings').upsert({
        key: 'xhs_worker_cookie_status',
        value: JSON.stringify({ status: 'ok', at: new Date().toISOString() }),
      });
    }

    return json({ ok: true, status });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
