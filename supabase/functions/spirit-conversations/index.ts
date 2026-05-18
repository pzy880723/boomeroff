// 小精灵会话管理：列表 / 加载消息 / 重命名 / 删除
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: '未登录' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await client.auth.getUser();
    if (!u.user) return json({ error: '未登录' }, 401);
    const uid = u.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'list');

    if (action === 'list') {
      const { data, error } = await client
        .from('spirit_conversations')
        .select('id, title, summary, message_count, last_message_at, created_at')
        .eq('user_id', uid)
        .eq('archived', false)
        .order('last_message_at', { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json({ items: data || [] });
    }

    if (action === 'messages') {
      const cid = String(body?.conversationId || '');
      if (!cid) return json({ error: '缺少 conversationId' }, 400);
      const { data, error } = await client
        .from('spirit_messages')
        .select('id, role, content, images, created_at')
        .eq('conversation_id', cid)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) return json({ error: error.message }, 500);
      return json({ items: data || [] });
    }

    if (action === 'rename') {
      const cid = String(body?.conversationId || '');
      const title = String(body?.title || '').slice(0, 60);
      if (!cid || !title) return json({ error: '参数不全' }, 400);
      const { error } = await client.from('spirit_conversations').update({ title }).eq('id', cid).eq('user_id', uid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'delete') {
      const cid = String(body?.conversationId || '');
      if (!cid) return json({ error: '缺少 conversationId' }, 400);
      const { error } = await client.from('spirit_conversations').delete().eq('id', cid).eq('user_id', uid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'usage') {
      // 仅本人最近 30 天
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await client
        .from('spirit_usage')
        .select('created_at, output_tokens, tool_calls, duration_ms, model')
        .eq('user_id', uid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return json({ error: error.message }, 500);
      return json({ items: data || [] });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '未知错误' }, 500);
  }
});
