import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/search';
const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const SUMMARIZE_MODEL = 'google/gemini-2.5-flash';
const FIRECRAWL_TIMEOUT_MS = 25_000;
const AI_TIMEOUT_MS = 20_000;

function normalizeKey(parts: Array<string | undefined | null>): string {
  return parts
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase())
    .join(' | ')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function safeParseJSON(raw: string): any | null {
  if (!raw) return null;
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) txt = m[0];
  try { return JSON.parse(txt.replace(/,(\s*[}\]])/g, '$1')); } catch { /* */ }
  try { return JSON.parse(txt); } catch { return null; }
}

const SUMMARIZE_TOOL = {
  type: 'function',
  function: {
    name: 'submit_xianyu_summary',
    description: '从闲鱼搜索结果中筛选同款并汇总价格区间',
    parameters: {
      type: 'object',
      properties: {
        samples: {
          type: 'array',
          description: '筛选后真正同款的条目，按价格升序，最多10条',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              price: { type: 'number', description: '人民币元，整数' },
              url: { type: 'string' },
              sold: { type: 'boolean', description: '是否已成交' },
            },
            required: ['title', 'price', 'url'],
          },
        },
        min_price: { type: 'number' },
        max_price: { type: 'number' },
        avg_price: { type: 'number' },
        suggested_price: { type: 'number', description: '门店建议挂牌价（综合品相、稀缺度，通常在中位数附近偏上）' },
        notes: { type: 'string', description: '一句话点评，30-60字，给店员看' },
      },
      required: ['samples', 'min_price', 'max_price', 'avg_price', 'suggested_price', 'notes'],
    },
  },
};

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
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

    const body = await req.json().catch(() => ({}));
    const {
      productId,
      name,
      brand,
      era,
      category,
      force,
    } = body as {
      productId?: string; name: string; brand?: string;
      era?: string; category?: string; force?: boolean;
    };
    if (!name) {
      return new Response(JSON.stringify({ error: '缺少商品名' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const queryKey = normalizeKey([brand, name, era, category]);

    // 缓存命中（除非 force）
    if (!force) {
      const { data: cached } = await adminClient
        .from('xianyu_price_snapshots').select('*').eq('query_key', queryKey).maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({ snapshot: cached, fromCache: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: '行情服务未配置（缺少 Firecrawl 密钥）' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: 'AI 未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Firecrawl 搜
    const queryParts = [`site:goofish.com`, name];
    if (brand) queryParts.unshift(brand);
    if (era) queryParts.push(era);
    const fcQuery = queryParts.join(' ');

    let fcResp: Response;
    try {
      fcResp = await fetchWithTimeout(FIRECRAWL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: fcQuery,
          limit: 20,
          tbs: 'qdr:y',
          scrapeOptions: { formats: ['markdown'] },
        }),
      }, FIRECRAWL_TIMEOUT_MS);
    } catch (e) {
      console.warn('[Xianyu] firecrawl timeout:', e);
      return new Response(JSON.stringify({ error: '行情查询超时，请稍后重试' }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (fcResp.status === 402) {
      return new Response(JSON.stringify({ error: '行情查询额度不足，请联系管理员' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!fcResp.ok) {
      const t = await fcResp.text();
      console.error('[Xianyu] firecrawl error', fcResp.status, t.slice(0, 300));
      return new Response(JSON.stringify({ error: '行情查询失败' }), {
        status: fcResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fcData = await fcResp.json();
    // Firecrawl v2 search 返回 { success, data: { web: [{title,url,description,markdown}] } } 或 { data: [...] }
    const rawList: any[] =
      (fcData?.data?.web ?? fcData?.data?.results ?? fcData?.data ?? fcData?.results ?? []);
    const candidates = (Array.isArray(rawList) ? rawList : [])
      .filter((r: any) => typeof r?.url === 'string')
      .slice(0, 20)
      .map((r: any) => ({
        title: r.title || '',
        url: r.url,
        description: r.description || '',
        markdown: typeof r.markdown === 'string' ? r.markdown.slice(0, 600) : '',
      }));

    if (candidates.length === 0) {
      // 仍然写一条空快照，避免反复触发收费查询
      const empty = {
        product_id: productId ?? null,
        query_key: queryKey,
        display_name: name,
        min_price: null, max_price: null, avg_price: null, suggested_price: null,
        sample_count: 0,
        samples: [],
        notes: '未在闲鱼上找到同款公开数据，建议参考门店历史成交价。',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };
      await adminClient.from('xianyu_price_snapshots')
        .upsert(empty, { onConflict: 'query_key' });
      return new Response(JSON.stringify({ snapshot: empty, empty: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) AI 汇总
    const systemPrompt = `你是日本中古杂货资深买手。下面给你 Firecrawl 在闲鱼（goofish.com）搜到的若干条目。请：
1) 严格筛选出真正同款的条目（型号/品牌/年代要对得上），不相关的全部丢弃；
2) 从标题/描述里抽取人民币价格（整数，单位元，去掉¥/￥/元），无价格的丢弃；
3) 算 min/max/avg，剔除上下 10% 离群；
4) 给出 suggested_price——门店建议挂牌价：通常在中位数附近偏上 10-30%，结合稀缺度调整；
5) notes 一句话 30-60 字，给店员参考（例如"同款最近半年成交价集中在 ¥xxx，挂 ¥xxx 比较稳"）。

搜索目标：${name}${brand ? '（品牌：' + brand + '）' : ''}${era ? '（年代：' + era + '）' : ''}

候选数据（JSON）：
${JSON.stringify(candidates).slice(0, 8000)}

请调用 submit_xianyu_summary 一次性提交结果。`;

    let aiResp: Response;
    try {
      aiResp = await fetchWithTimeout(LOVABLE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SUMMARIZE_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: '请按要求汇总。' },
          ],
          tools: [SUMMARIZE_TOOL],
          tool_choice: { type: 'function', function: { name: 'submit_xianyu_summary' } },
        }),
      }, AI_TIMEOUT_MS);
    } catch (e) {
      console.warn('[Xianyu] AI timeout:', e);
      return new Response(JSON.stringify({ error: 'AI 汇总超时' }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('[Xianyu] AI error', aiResp.status, t.slice(0, 300));
      return new Response(JSON.stringify({ error: 'AI 汇总失败' }), {
        status: aiResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiData = await aiResp.json();
    const message = aiData.choices?.[0]?.message;
    let parsed: any = null;
    const tc = (message?.tool_calls || []).find((t: any) => t?.function?.name === 'submit_xianyu_summary');
    if (tc?.function?.arguments) parsed = safeParseJSON(tc.function.arguments);
    if (!parsed && message?.content) parsed = safeParseJSON(message.content);

    const samples = Array.isArray(parsed?.samples) ? parsed.samples.slice(0, 10) : [];
    const snapshot = {
      product_id: productId ?? null,
      query_key: queryKey,
      display_name: name,
      min_price: typeof parsed?.min_price === 'number' ? parsed.min_price : null,
      max_price: typeof parsed?.max_price === 'number' ? parsed.max_price : null,
      avg_price: typeof parsed?.avg_price === 'number' ? Math.round(parsed.avg_price) : null,
      suggested_price: typeof parsed?.suggested_price === 'number' ? Math.round(parsed.suggested_price) : null,
      sample_count: samples.length,
      samples,
      notes: typeof parsed?.notes === 'string' ? parsed.notes : null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveErr } = await adminClient
      .from('xianyu_price_snapshots')
      .upsert(snapshot, { onConflict: 'query_key' })
      .select()
      .maybeSingle();
    if (saveErr) {
      console.error('[Xianyu] save error', saveErr);
    }

    return new Response(JSON.stringify({ snapshot: saved ?? snapshot, fromCache: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[Xianyu] error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
