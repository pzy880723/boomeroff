// Worker 拉取一个待核查的小红书发文任务
// 鉴权：header X-Worker-Token = env XHS_WORKER_TOKEN
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
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 超时回退：running 但 5 分钟没心跳 → 回到 pending
    const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await sb
      .from('activity_applications')
      .update({ xhs_verify_status: 'pending' })
      .eq('xhs_verify_status', 'running')
      .lt('xhs_verify_last_at', staleCutoff);

    // 找一条待核查
    const { data: candidate } = await sb
      .from('activity_applications')
      .select('id, activity_id, xhs_note_url, xhs_note_id, xhs_verify_attempts, form_data, applicant_name')
      .in('xhs_verify_status', ['pending', 'failed'])
      .lt('xhs_verify_attempts', 5)
      .not('xhs_note_url', 'is', null)
      .order('xhs_verify_last_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();
    if (!candidate) return json({ empty: true });

    // 原子占用
    const nowIso = new Date().toISOString();
    const { data: claimed, error: uErr } = await sb
      .from('activity_applications')
      .update({
        xhs_verify_status: 'running',
        xhs_verify_last_at: nowIso,
        xhs_verify_attempts: (candidate.xhs_verify_attempts ?? 0) + 1,
      })
      .eq('id', candidate.id)
      .in('xhs_verify_status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (uErr || !claimed) return json({ empty: true });

    // 取 activity 关键词
    const { data: activity } = await sb
      .from('activities')
      .select('id, name, voucher:vouchers(name)')
      .eq('id', candidate.activity_id)
      .maybeSingle();

    // 取 cookie / UA
    const { data: settings } = await sb
      .from('app_settings')
      .select('key, value')
      .in('key', ['xhs_worker_cookie', 'xhs_worker_user_agent']);
    const settingMap: Record<string, string> = {};
    for (const row of settings ?? []) settingMap[(row as any).key] = String((row as any).value || '');

    // 从 form_data 找主页链接（role=xhs_profile_url 或第一个 url 字段），需要读 activity form_fields
    const { data: actFields } = await sb
      .from('activities')
      .select('form_fields')
      .eq('id', candidate.activity_id)
      .maybeSingle();
    const fields = (actFields?.form_fields as Array<any>) || [];
    const profileField = fields.find((f) => f?.role === 'xhs_profile_url')
      || fields.find((f) => f?.type === 'url' || f?.type === 'text');
    const xhs_profile_url = profileField
      ? String((candidate.form_data as any)?.[profileField.key] ?? '')
      : '';

    const keywords = [
      activity?.name,
      (activity as any)?.voucher?.name,
      candidate.applicant_name,
    ].filter(Boolean).map((s) => String(s));

    return json({
      application_id: candidate.id,
      xhs_note_url: candidate.xhs_note_url,
      xhs_note_id: candidate.xhs_note_id,
      xhs_profile_url,
      keywords,
      cookie: settingMap['xhs_worker_cookie'] || null,
      user_agent: settingMap['xhs_worker_user_agent']
        || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
