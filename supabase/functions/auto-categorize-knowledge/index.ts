import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VALID_CATEGORIES = [
  'jp_porcelain', 'eu_porcelain', 'incense', 'antique_art', 'local_craft',
  'anime_toy', 'otaku_goods', 'luxury', 'vintage_jewelry',
  'game_console', 'walkman', 'ccd', 'media_record', 'playback_device',
  'home_appliance', 'hobby', 'other',
] as const;

const CATEGORY_HINT = `品类参考：
- jp_porcelain 日瓷（有田/九谷/京烧/香兰社等）
- eu_porcelain 欧瓷（Wedgwood/Meissen/Royal Copenhagen 等）
- incense 线香、香道用品
- antique_art 古美术（书画、漆器、铜器、木器、织物等老物件）
- local_craft 本地特色手作（闽南瓷、地方茶器等）
- anime_toy 动漫玩具（高达、圣斗士、假面骑士、食玩、怪兽）
- otaku_goods 二次元周边（手办、景品、徽章、挂件、同人）
- luxury 奢侈品（包袋、服饰、配饰、腕表）
- vintage_jewelry 中古首饰（项链/戒指/胸针/耳饰/手链）
- game_console 游戏机、卡带、掌机
- walkman 随身听 / Discman / MD
- ccd CCD 数码相机
- media_record 音像制品（黑胶/磁带/CD/DVD）
- playback_device 播放设备（黑胶机/卡带机/CD 机/收音机）
- home_appliance 家用电器（电视/收音/厨电/灯具）
- hobby 兴趣爱好（文具/香水/烟具/户外）
- other 实在归不进去的`;

const SYSTEM = `你是一名中古杂货店分类助手。根据用户给出的商品名称、IP/品牌、简介、卖点、年代，判断该词条最合适的一个品类编码。
${CATEGORY_HINT}
规则：
1. 只能从上述编码中选一个，禁止编造新编码。
2. 旧分类（porcelain/jewelry/stationery 等）一律重新映射到新编码。例如旧的 porcelain → jp_porcelain 或 eu_porcelain 视产地。
3. 优先看名称和品牌；不确定就返回 other。`;

async function callAI(prompt: string, apiKey: string): Promise<string> {
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'set_category',
          description: '为该词条选择最合适的品类编码',
          parameters: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: [...VALID_CATEGORIES] },
              reason: { type: 'string', description: '一句话理由（中文，<30字）' },
            },
            required: ['category'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'set_category' } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('AI 未返回分类');
  const parsed = JSON.parse(args);
  if (!VALID_CATEGORIES.includes(parsed.category)) return 'other';
  return parsed.category;
}

function buildPrompt(item: Record<string, unknown>): string {
  const lines: string[] = [];
  if (item.name) lines.push(`名称：${item.name}`);
  if (item.ip_name) lines.push(`IP/品牌：${item.ip_name}`);
  if (item.summary) lines.push(`简介：${item.summary}`);
  if (item.era) lines.push(`年代：${item.era}`);
  if (item.origin) lines.push(`产地：${item.origin}`);
  const sp = Array.isArray(item.selling_points) ? item.selling_points : [];
  if (sp.length) {
    const text = sp.map((p: any) => (typeof p === 'string' ? p : p?.text || p?.tag || '')).filter(Boolean).slice(0, 5).join('；');
    if (text) lines.push(`卖点：${text}`);
  }
  if (item.tips) lines.push(`贴士：${String(item.tips).slice(0, 80)}`);
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY 未配置');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'single';

    if (mode === 'single') {
      const item = {
        name: body.name,
        ip_name: body.ip_name,
        summary: body.summary,
        era: body.era,
        origin: body.origin,
        selling_points: body.selling_points,
        tips: body.tips,
      };
      const category = await callAI(buildPrompt(item), apiKey);
      return new Response(JSON.stringify({ category }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // batch mode
    const target: 'official' | 'personal' | 'both' = body.target || 'both';
    const results = { official: { total: 0, updated: 0, failed: 0 }, personal: { total: 0, updated: 0, failed: 0 } };

    if (target === 'official' || target === 'both') {
      const { data } = await supabase.from('official_knowledge')
        .select('id, name, ip_name, summary, era, origin, selling_points, tips, category');
      const list = data || [];
      results.official.total = list.length;
      for (const it of list) {
        try {
          const newCat = await callAI(buildPrompt(it), apiKey);
          if (newCat && newCat !== it.category) {
            const { error } = await supabase.from('official_knowledge').update({ category: newCat }).eq('id', it.id);
            if (error) throw error;
            results.official.updated++;
          }
        } catch (e) {
          results.official.failed++;
          console.error('official categorize fail', it.id, e);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (target === 'personal' || target === 'both') {
      const { data } = await supabase.from('product_knowledge')
        .select('id, product_name, category, era, origin, selling_points, tips');
      const list = data || [];
      results.personal.total = list.length;
      for (const it of list) {
        try {
          const newCat = await callAI(buildPrompt({ ...it, name: it.product_name }), apiKey);
          if (newCat && newCat !== it.category) {
            const { error } = await supabase.from('product_knowledge').update({ category: newCat }).eq('id', it.id);
            if (error) throw error;
            results.personal.updated++;
          }
        } catch (e) {
          results.personal.failed++;
          console.error('personal categorize fail', it.id, e);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('auto-categorize-knowledge error', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
