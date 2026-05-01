// 管理员审核：通过 → 写入 official_knowledge 让 RAG 自动生效；驳回 → 仅移除
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PENDING_KEY = 'pending_corrections';

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
    const { data: { user }, error: ue } = await userClient.auth.getUser();
    if (ue || !user) {
      return new Response(JSON.stringify({ error: '登录已过期' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from('user_roles').select('role').eq('user_id', user.id).single();
    if (!roleData || roleData.role !== 'admin') {
      return new Response(JSON.stringify({ error: '仅管理员可操作' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { id, action } = await req.json();
    if (!id || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: '参数错误' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: cur } = await adminClient
      .from('app_settings').select('value').eq('key', PENDING_KEY).maybeSingle();
    const items: any[] = Array.isArray(cur?.value?.items) ? cur!.value.items : [];
    const target = items.find((it) => it.id === id);
    if (!target) {
      return new Response(JSON.stringify({ error: '该样本已被处理' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'approve') {
      const cp = target.corrected_payload || {};
      try {
        await adminClient.from('official_knowledge').insert({
          name: cp.name || '未知',
          category: cp.category || 'other',
          summary: cp.description || target.user_hint || null,
          content: {
            material: cp.material || null,
            craft: cp.craft || null,
            source_hint: target.user_hint || null,
          },
          era: cp.era || null,
          origin: cp.origin || null,
          cover_url: target.image_url || null,
          gallery: target.image_url ? [target.image_url] : [],
          selling_points: Array.isArray(cp.sellingPoints) ? cp.sellingPoints : [],
          tips: cp.tips || null,
          source_product_id: target.product_id || null,
          created_by: user.id,
        });
      } catch (e) {
        console.error('[Review] insert official_knowledge failed:', e);
        return new Response(JSON.stringify({ error: '写入官方知识失败' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const remaining = items.filter((it) => it.id !== id);
    await adminClient.from('app_settings').upsert({
      key: PENDING_KEY,
      value: { items: remaining },
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[Review] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
