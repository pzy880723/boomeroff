import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const ALLOWED_MODELS = new Set([
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '登录已过期' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: '仅管理员可测试' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { model } = await req.json().catch(() => ({}));
    const useModel = (typeof model === 'string' && ALLOWED_MODELS.has(model))
      ? model : 'google/gemini-2.5-flash-lite';

    const key = Deno.env.get('LOVABLE_API_KEY') || '';
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: 'Lovable AI 未配置' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const start = Date.now();
    const resp = await fetch(LOVABLE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: useModel,
        messages: [{ role: 'user', content: 'ping，请回复 ok' }],
        max_tokens: 10,
      }),
    });
    const ms = Date.now() - start;

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[test-ai-model] failed:', resp.status, text);
      return new Response(JSON.stringify({
        ok: false,
        error: `${resp.status}: ${text.slice(0, 200)}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '(无内容)';
    return new Response(JSON.stringify({
      ok: true,
      message: `连接成功 · 用时 ${ms}ms · 回复："${String(content).slice(0, 60)}"`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[test-ai-model] error:', e);
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : '未知错误',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
