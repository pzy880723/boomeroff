// kb-accept：用户点击"★ 加入知识库"，把 AI 输出（含 BOOMER 对话）回流为 accepted_output
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json();
    const title = String(body?.title || '已采纳的 AI 输出').slice(0, 200);
    const content = String(body?.content || '').trim();
    const scopes = Array.isArray(body?.scopes) && body.scopes.length ? body.scopes : ['image', 'copy', 'video', 'chat'];
    const shop_id = body?.shop_id || null;
    const source = String(body?.source || 'unknown');
    if (!content) return new Response(JSON.stringify({ error: 'empty content' }), { status: 400, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const source_id = crypto.randomUUID();
    await admin.from('kb_ingest_queue').insert({
      source_type: 'accepted_output',
      source_id,
      op: 'upsert',
      payload: { title, content, scopes, shop_id, source, user_id: u.user.id, accepted_at: new Date().toISOString() },
    });
    // 直接 upsert 一条占位（kb-ingest 触发时若 buildDoc 返回 null 会保留 payload — 这里我们直接写完整文档以避免依赖源表）
    await admin.from('kb_documents').insert({
      source_type: 'accepted_output',
      source_id,
      shop_id,
      scopes,
      title,
      content,
      content_hash: null,
      metadata: { source, user_id: u.user.id },
    });
    // 单独触发一次嵌入（异步，不阻塞返回）
    const ingestUrl = `${SUPABASE_URL}/functions/v1/kb-ingest`;
    fetch(ingestUrl, { method: 'POST' }).catch(() => {});

    return new Response(JSON.stringify({ ok: true, id: source_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: corsHeaders });
  }
});
