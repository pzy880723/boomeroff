// 提交纠错样本到待审核队列；同时更新 products 表（让本次识别结果立即修正）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PENDING_KEY = 'pending_corrections';
const MAX_PENDING = 200;

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
    if (!roleData || (roleData.role !== 'admin' && roleData.role !== 'anchor')) {
      return new Response(JSON.stringify({ error: '没有权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      product_id,
      image_url,
      original_payload,
      corrected_payload,
      user_hint,
      conversation,
    } = body || {};

    if (!corrected_payload?.name) {
      return new Response(JSON.stringify({ error: '缺少纠正后的名称' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) 立即更新 products（本次识别即时修正）
    if (product_id) {
      try {
        await adminClient.from('products').update({
          name: corrected_payload.name,
          category: corrected_payload.category || 'other',
          era: corrected_payload.era || null,
          origin: corrected_payload.origin || null,
          material: corrected_payload.material || null,
          craft: corrected_payload.craft || null,
          description: corrected_payload.description || null,
          selling_points: corrected_payload.sellingPoints || [],
          tips: corrected_payload.tips || null,
        }).eq('id', product_id);
      } catch (e) {
        console.warn('[Submit-Correction] product update failed:', e);
      }
    }

    // 2) 追加到 app_settings.pending_corrections 队列
    const { data: cur } = await adminClient
      .from('app_settings').select('value').eq('key', PENDING_KEY).maybeSingle();
    const items: any[] = Array.isArray(cur?.value?.items) ? cur!.value.items : [];

    const entry = {
      id: crypto.randomUUID(),
      product_id: product_id || null,
      image_url: image_url || null,
      original_payload: original_payload || {},
      corrected_payload,
      user_hint: user_hint || '',
      conversation: Array.isArray(conversation) ? conversation : [],
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      status: 'pending',
    };
    items.unshift(entry);
    // 队列上限保护
    const trimmed = items.slice(0, MAX_PENDING);

    await adminClient.from('app_settings').upsert({
      key: PENDING_KEY,
      value: { items: trimmed },
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    return new Response(JSON.stringify({ ok: true, id: entry.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[Submit-Correction] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
