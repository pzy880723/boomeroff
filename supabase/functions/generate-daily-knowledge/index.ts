import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callAI(prompt: string, apiKey: string) {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: '你是中古商品知识专家，帮助店员学习库存商品知识。只返回 JSON。' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  return response;
}

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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI 服务未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: '登录已过期' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().slice(0, 10);

    // 已有则直接返回
    const { data: existing } = await adminClient
      .from('daily_knowledge')
      .select('content')
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ content: existing.content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 拉取最近 7 天商品
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: products } = await adminClient
      .from('products')
      .select('id, name, category, era, origin, material, craft, selling_points, image_url')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!products || products.length === 0) {
      const emptyContent = {
        summary: '近 7 天暂无新识别商品。多去识别商品，知识点会越来越丰富！',
        highlights: [],
        featured: [],
      };
      await adminClient.from('daily_knowledge').insert({ date: today, content: emptyContent });
      return new Response(JSON.stringify({ content: emptyContent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const productList = products.map((p, i) =>
      `${i + 1}. ${p.name}（${p.category}${p.era ? '/' + p.era : ''}${p.origin ? '/' + p.origin : ''}）` +
      (Array.isArray(p.selling_points) && p.selling_points.length
        ? ' - 卖点: ' + (p.selling_points as string[]).slice(0, 2).join('；')
        : '')
    ).join('\n');

    const prompt = `以下是中古杂货铺最近 7 天识别入库的商品列表，请为店员生成今日学习知识点。
${productList}

返回 JSON：
{
  "summary": "1-2 句话总结今天学习方向（如本周新增以瓷器为主，重点学习釉下彩工艺）",
  "highlights": ["跨商品提炼的中古知识要点 1", "要点 2", "要点 3", "要点 4"],
  "featured": [
    {"index": 商品在上方列表的序号, "point": "1 句话核心卖点速记"},
    ...选 3 件最有代表性的
  ]
}
仅返回 JSON。`;

    const aiResp = await callAI(prompt, LOVABLE_API_KEY);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('[DailyKnowledge] AI error:', aiResp.status, t);
      return new Response(JSON.stringify({ error: '生成失败' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    const text = aiData.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed: { summary?: string; highlights?: string[]; featured?: Array<{ index: number; point: string }> } = {};
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }

    const featured = (parsed.featured || []).map(f => {
      const p = products[(f.index || 1) - 1];
      if (!p) return null;
      return { name: p.name, point: f.point, image_url: p.image_url };
    }).filter(Boolean);

    const content = {
      summary: parsed.summary || '今日无总结',
      highlights: parsed.highlights || [],
      featured,
    };

    await adminClient.from('daily_knowledge').upsert(
      { date: today, content },
      { onConflict: 'date' },
    );

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[DailyKnowledge] error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '生成失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
