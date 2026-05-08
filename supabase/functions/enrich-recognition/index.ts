import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const ENRICH_MODEL = 'google/gemini-2.5-flash'; // 故事生成够用，且支持 google_search
const ENRICH_TIMEOUT_MS = 25_000;

const ENRICH_TOOL = {
  type: 'function',
  function: {
    name: 'submit_enrichment',
    description: '提交商品深度故事 + 完整知识卡（不含 body 深度阅读长正文）',
    parameters: {
      type: 'object',
      properties: {
        story: {
          type: 'string',
          description: '180-260字深度口语化故事段，店员逐字念给客人听 25-35 秒。讲品牌/作家/年代真实背景、生产年限、当年用途、同款最新行情或拍卖纪录、为什么稀缺。要像真人说话，"您看…""其实当年…""我跟您讲…" 这种口吻，给具体数字。禁用「主播」字样。',
        },
        highlight: {
          type: 'string',
          description: '≤80字一句话核心卖点，包含至少一个数字（年代/产量/行情/价位）。',
        },
        description: {
          type: 'string',
          description: '200-320字客观长描述，详情页用。讲清品牌沿革、工艺特征、年代判断依据。',
        },
        sellingPoints: {
          type: 'array',
          minItems: 4,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string', enum: ['身世', '工艺', '稀缺', '场景'] },
              text: { type: 'string', description: '≤32字完整卖点句' },
            },
            required: ['tag', 'text'],
          },
        },
        objection: { type: 'string', description: '≤80字砍价/质疑应答，自然口语。' },
        memory: { type: 'string', description: '≤30字记忆口诀' },

        // —— 富知识卡（与官方知识卡一致）——
        one_liner: {
          type: 'string',
          description: '★金句★ ≤30字中文，全部正向表达。可在身份定位、时代符号、工艺亮点、场景画面、收藏价值中灵活挑选；禁用「便宜/廉价/劣质/二手感/过时/淘汰/不值/平替」等贬低词；禁止使用「主播」。',
        },
        pronunciation: { type: 'string', description: '中文/罗马字/日文读音，例如「ノリタケ Noritake」' },
        aliases: { type: 'array', items: { type: 'string' }, description: '常见别名/简称，最多 4 个' },
        quick_facts: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', enum: ['创立年代', '产地', '工艺', '代表元素', '价位段'] },
              value: { type: 'string', description: '具体数字或专有名词' },
            },
            required: ['label', 'value'],
          },
        },
        customer_pitches: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              scene: { type: 'string', enum: ['送礼', '自用', '收藏'] },
              line: { type: 'string', description: '≤40字直接念给客人的话' },
            },
            required: ['scene', 'line'],
          },
        },
        selling_points_rich: {
          type: 'array',
          minItems: 4,
          maxItems: 6,
          description: '带 tag/主句/detail 三段式，每段更详细（detail 40-80字）。',
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string' },
              text: { type: 'string' },
              detail: { type: 'string' },
            },
            required: ['tag', 'text', 'detail'],
          },
        },
        comparisons: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              diff: { type: 'string', description: '30-60字一眼可辨的差别' },
            },
            required: ['name', 'diff'],
          },
        },
      },
      required: ['story', 'highlight', 'sellingPoints', 'one_liner', 'quick_facts', 'customer_pitches', 'comparisons'],
    },
  },
};

function safeParseJSON(raw: string): any | null {
  if (!raw) return null;
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) txt = m[0];
  try { return JSON.parse(txt.replace(/,(\s*[}\]])/g, '$1')); } catch { /* */ }
  try { return JSON.parse(txt); } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    const body = await req.json();
    const {
      productId,
      name, category, era, origin, material, craft,
      currentDescription, currentStory, currentSellingPoints,
    } = body as {
      productId?: string;
      name: string; category?: string; era?: string; origin?: string;
      material?: string; craft?: string;
      currentDescription?: string; currentStory?: string;
      currentSellingPoints?: Array<{ tag: string; text: string } | string>;
    };
    if (!name) {
      return new Response(JSON.stringify({ error: '缺少商品名' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 已有 enrichment 直接返回（同 product 不重复跑）；要求富字段也已生成
    if (productId) {
      const { data: existing } = await adminClient
        .from('products').select('ai_analysis').eq('id', productId).maybeSingle();
      const cached = (existing?.ai_analysis as any)?.enriched;
      if (cached?.story && cached?.updatedAt && cached?.one_liner) {
        return new Response(JSON.stringify({ enriched: cached, fromCache: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: 'AI 未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ctx = [
      `商品名：${name}`,
      category ? `类目：${category}` : '',
      era ? `年代：${era}` : '',
      origin ? `产地：${origin}` : '',
      material ? `材质：${material}` : '',
      craft ? `工艺：${craft}` : '',
      currentDescription ? `初版描述：${currentDescription.slice(0, 200)}` : '',
      currentStory ? `初版故事：${currentStory.slice(0, 160)}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `你是日本中古杂货资深鉴定师 + 王牌销售。结合下方商品信息，必要时使用网络搜索核实品牌/年代/同款行情，输出比初版更深入的销售话术 + 一份完整知识卡。

【硬性规则】
1. 全部简体中文，外文品牌音译（Sony→索尼）。**绝不出现「主播」字样**，店员对客人称「您」。
2. 禁用空话：非常精美/极具价值/匠心独运/巧夺天工/美轮美奂。能给数字就给数字。
3. story 必须 180-260 字，口语化「您看…」「其实当年…」，10-15 秒讲完顾客已经心动。
4. 必须比初版更具体：加入真实背景（生产年限/品牌历史/同款拍卖价/存世量）。无法核实的就讲场景类比，绝不编造数字。
5. sellingPoints 4-6 条，每条 ≤32 字完整句，tag 必须是 身世/工艺/稀缺/场景。
6. one_liner ≤30 字正向金句；quick_facts 5 条标签固定（创立年代/产地/工艺/代表元素/价位段）；customer_pitches 必须覆盖 送礼/自用/收藏 三场景；selling_points_rich 4-6 条带 tag/text/detail；comparisons 至少 2 条易混对比。

【商品信息】
${ctx}

请调用 submit_enrichment 工具一次性提交所有字段。`;

    const reqBody: any = {
      model: ENRICH_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请补充更深入的销售故事，必要时联网核实。' },
      ],
      tools: [ENRICH_TOOL, { type: 'google_search' }],
      tool_choice: 'auto',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(LOVABLE_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });
    } catch (e) {
      console.warn('[Enrich] fetch failed:', e);
      return new Response(JSON.stringify({ error: '深度补充超时' }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('[Enrich] AI error:', resp.status, txt.slice(0, 300));
      return new Response(JSON.stringify({ error: '深度补充失败' }), {
        status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const message = data.choices?.[0]?.message;
    let used = false;
    const grounding = message?.grounding_metadata
      ?? data.choices?.[0]?.grounding_metadata
      ?? message?.groundingMetadata;
    if (grounding) used = true;

    let parsed: any = null;
    const tc = (message?.tool_calls || []).find((t: any) => t?.function?.name === 'submit_enrichment');
    if (tc?.function?.arguments) parsed = safeParseJSON(tc.function.arguments);
    if (!parsed && message?.content) parsed = safeParseJSON(message.content);

    if (!parsed?.story) {
      return new Response(JSON.stringify({ error: '深度补充返回为空' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const enriched = {
      story: String(parsed.story),
      highlight: parsed.highlight ? String(parsed.highlight) : undefined,
      description: parsed.description ? String(parsed.description) : undefined,
      sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints : undefined,
      objection: parsed.objection ? String(parsed.objection) : undefined,
      memory: parsed.memory ? String(parsed.memory) : undefined,
      webSearchUsed: used,
      updatedAt: new Date().toISOString(),
    };

    // 写回 products，便于下次缓存命中时直接复用
    if (productId) {
      try {
        const { data: row } = await adminClient
          .from('products').select('ai_analysis, description, selling_points, tips')
          .eq('id', productId).maybeSingle();
        const aiAnalysis = (row?.ai_analysis as any) || {};
        aiAnalysis.enriched = enriched;
        const updates: any = { ai_analysis: aiAnalysis };
        // 同步覆盖描述/卖点（更长更全的版本）
        if (enriched.description && enriched.description.length > (row?.description?.length || 0)) {
          updates.description = enriched.description;
        }
        if (enriched.sellingPoints && enriched.sellingPoints.length >= 4) {
          updates.selling_points = enriched.sellingPoints;
        }
        await adminClient.from('products').update(updates).eq('id', productId);
      } catch (e) {
        console.warn('[Enrich] persist failed:', e);
      }
    }

    return new Response(JSON.stringify({ enriched, webSearchUsed: used }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[Enrich] error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'enrich failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
