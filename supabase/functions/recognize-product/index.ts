import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// 唯一保留的模型来源：Lovable AI Gemini
const ALLOWED_MODELS = new Set([
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
]);
// 默认极速档：店内识别 1-3 秒出首屏
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
const HIGH_MODEL = 'google/gemini-2.5-pro';
const LITE_MODEL = 'google/gemini-2.5-flash-lite';

interface ModelConfig {
  model: string;
  enableWebSearch: boolean;
  enableQuickMatch: boolean;
}

async function resolveModelConfig(adminClient: any, _multiImage: boolean): Promise<ModelConfig> {
  // 主识别硬编码极速档：所有用户场景都要 1-3 秒首屏。
  // 长话术、联网核实全部交给后台 enrich-recognition，避免主识别再被任何配置拖慢。
  const _ = adminClient; // settings 仍然给 enrich/admin UI 看；主识别不再读取
  return {
    model: LITE_MODEL,
    enableWebSearch: false,
    enableQuickMatch: false,
  };
}

function safeParseJSON(raw: string): any | null {
  if (!raw) return null;
  let txt = raw.trim();
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const match = txt.match(/\{[\s\S]*\}/);
  if (match) txt = match[0];
  const cleaned = txt.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(cleaned); } catch (_) { /* fallthrough */ }
  try { return JSON.parse(txt); } catch (_) { return null; }
}

// 主识别 schema 已大幅瘦身：只做"鉴别"，长话术/砍价应答全部交给后台 enrich
const RECOGNITION_TOOL = {
  type: 'function',
  function: {
    name: 'submit_recognition',
    description: '快速鉴定中古商品基本属性',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '商品名称（≤12字 简体中文）' },
        category: {
          type: 'string',
          enum: ['jp_porcelain', 'eu_porcelain', 'incense', 'antique_art', 'local_craft',
                 'anime_toy', 'otaku_goods', 'luxury', 'vintage_jewelry', 'game_console',
                 'walkman', 'ccd', 'media_record', 'playback_device', 'home_appliance',
                 'hobby', 'other'],
        },
        era: { type: 'string', description: '年代，未知写"不详"' },
        origin: { type: 'string', description: '产地/窑口/品牌，未知写"不详"' },
        material: { type: 'string', description: '材质，未知写"不详"' },
        craft: { type: 'string', description: '工艺，未知写"不详"' },
        sellingPoints: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string', enum: ['身世', '工艺', '稀缺', '场景'] },
              text: { type: 'string', description: '≤22汉字短句，能直接念' },
            },
            required: ['tag', 'text'],
          },
        },
        pitch: {
          type: 'object',
          properties: {
            opener: { type: 'string', description: '≤30字开场，含品类+年代/产地，结尾句号' },
            highlight: { type: 'string', description: '≤45字亮点句，结尾句号' },
          },
          required: ['opener', 'highlight'],
        },
        confidence: { type: 'number', description: '置信度 0-1' },
      },
      required: ['name', 'category', 'pitch', 'confidence'],
    },
  },
};

// 60 秒内存缓存：官方知识列表，避免每次识别都查 DB（每次约 350-500ms）
let _kbCache: { text: string; expiresAt: number } | null = null;
async function loadKnowledgeContext(adminClient: any): Promise<string> {
  const now = Date.now();
  if (_kbCache && _kbCache.expiresAt > now) return _kbCache.text;
  try {
    const { data } = await adminClient
      .from('official_knowledge')
      .select('name, category, era, origin, summary')
      .order('importance_score', { ascending: false })
      .order('view_count', { ascending: false })
      .limit(30);
    if (!data || data.length < 5) {
      _kbCache = { text: '', expiresAt: now + 60_000 };
      return '';
    }
    const lines = data.map((r: any) => {
      const parts = [r.name, r.category, r.era || '', r.origin || ''].filter(Boolean);
      return `- ${parts.join(' | ')}${r.summary ? ` —— ${String(r.summary).slice(0, 40)}` : ''}`;
    });
    const text = `\n\n【已收录的官方知识库（识别时优先匹配，若高度相似请直接沿用名称/年代/产地）】\n${lines.join('\n')}\n`;
    _kbCache = { text, expiresAt: now + 60_000 };
    return text;
  } catch (e) {
    console.warn('[Recognition] knowledge load failed:', e);
    return '';
  }
}

async function callAI(images: string[], systemPrompt: string, cfg: ModelConfig, signal?: AbortSignal) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  const imageUrls = images.map((img) =>
    img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
  );
  const userText = imageUrls.length > 1
    ? `以下为同一件中古商品的 ${imageUrls.length} 张多角度照片，请综合判断后调用 submit_recognition 工具提交结果。`
    : '请鉴定这件中古商品，调用 submit_recognition 工具提交结果。';

  const userContent: any[] = [{ type: 'text', text: userText }];
  for (const url of imageUrls) {
    userContent.push({ type: 'image_url', image_url: { url } });
  }

  const body: any = {
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  };

  if (cfg.enableWebSearch) {
    // 联网模式：让模型自己决定先搜还是先答
    body.tools = [RECOGNITION_TOOL, { type: 'google_search' }];
    body.tool_choice = 'auto';
  } else {
    body.tools = [RECOGNITION_TOOL];
    body.tool_choice = { type: 'function', function: { name: 'submit_recognition' } };
  }

  return await fetch(LOVABLE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function callAIWithTimeout(
  images: string[],
  systemPrompt: string,
  cfg: ModelConfig,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await callAI(images, systemPrompt, cfg, controller.signal);
  } catch (e) {
    const isAbort = e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message));
    console.warn('[Recognition] callAI failed/timeout:', isAbort ? `timeout after ${timeoutMs}ms` : e);
    return new Response(JSON.stringify({ error: isAbort ? 'timeout' : String(e) }), {
      status: 504,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ====== 缓存辅助 ======

async function loadRecentPrice(adminClient: any, productId: string) {
  try {
    const { data } = await adminClient
      .from('price_records')
      .select('price, price_type, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      price: Number(data.price),
      price_type: data.price_type || null,
      recorded_at: data.created_at || null,
    };
  } catch { return null; }
}

function productRowToResult(row: any) {
  let tipsObj: any = undefined;
  if (typeof row.tips === 'string' && row.tips.trim().startsWith('{')) {
    try { tipsObj = JSON.parse(row.tips); } catch { tipsObj = row.tips; }
  } else if (row.tips) {
    tipsObj = row.tips;
  }
  return {
    name: row.name,
    category: row.category,
    era: row.era || undefined,
    origin: row.origin || undefined,
    material: row.material || undefined,
    craft: row.craft || undefined,
    dimensions: row.dimensions || undefined,
    condition: row.condition || undefined,
    description: row.description || undefined,
    sellingPoints: Array.isArray(row.selling_points) ? row.selling_points : [],
    tips: tipsObj,
    confidence: 0.92,
  };
}

function officialRowToResult(row: any) {
  const c = row.content || {};
  let tipsObj: any = undefined;
  if (typeof row.tips === 'string' && row.tips.trim().startsWith('{')) {
    try { tipsObj = JSON.parse(row.tips); } catch { tipsObj = row.tips; }
  } else if (row.tips) {
    tipsObj = row.tips;
  }
  return {
    name: row.name,
    category: row.category,
    era: row.era || undefined,
    origin: row.origin || undefined,
    material: c.material || undefined,
    craft: c.craft || undefined,
    dimensions: c.dimensions || undefined,
    condition: c.condition || undefined,
    description: row.summary || undefined,
    sellingPoints: Array.isArray(row.selling_points) ? row.selling_points : [],
    tips: tipsObj,
    confidence: 0.95,
  };
}

const QUICK_TOOL = {
  type: 'function',
  function: {
    name: 'quick_classify',
    description: '快速分类：仅返回商品名、类目、年代',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '商品名（≤12字，简体中文）' },
        category: {
          type: 'string',
          enum: ['jp_porcelain', 'eu_porcelain', 'incense', 'antique_art', 'local_craft',
                 'anime_toy', 'otaku_goods', 'luxury', 'vintage_jewelry', 'game_console',
                 'walkman', 'ccd', 'media_record', 'playback_device', 'home_appliance',
                 'hobby', 'other'],
        },
        era: { type: 'string', description: '年代，未知写"不详"' },
      },
      required: ['name', 'category'],
    },
  },
};

async function tryQuickClassify(images: string[]): Promise<{ name: string; category: string; era?: string } | null> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  if (!lovableKey) return null;
  const imageUrls = images.slice(0, 1).map((img) =>
    img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
  );
  const userContent: any[] = [
    { type: 'text', text: '只判断商品的名称、类目、大致年代。调用 quick_classify 工具提交。' },
  ];
  for (const url of imageUrls) userContent.push({ type: 'image_url', image_url: { url } });
  const body: any = {
    model: LITE_MODEL,
    messages: [
      { role: 'system', content: '你是中古商品快速分类器。只返回商品名、类目、年代，不做长描述。' },
      { role: 'user', content: userContent },
    ],
    tools: [QUICK_TOOL],
    tool_choice: { type: 'function', function: { name: 'quick_classify' } },
  };
  try {
    const resp = await fetch(LOVABLE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = safeParseJSON(args);
    if (!parsed?.name || !parsed?.category) return null;
    return { name: String(parsed.name), category: String(parsed.category), era: parsed.era };
  } catch (e) {
    console.warn('[Recognition] quick classify error:', e);
    return null;
  }
}

async function tryNameMatch(adminClient: any, name: string, category: string) {
  const keyword = name.trim().slice(0, 6);
  if (keyword.length < 2) return null;
  try {
    const { data: ofRow } = await adminClient
      .from('official_knowledge')
      .select('*')
      .eq('category', category)
      .ilike('name', `%${keyword}%`)
      .order('importance_score', { ascending: false })
      .order('view_count', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ofRow) {
      return {
        result: officialRowToResult(ofRow),
        source: 'official' as const,
        cached_at: ofRow.updated_at || ofRow.created_at,
        product_id: ofRow.source_product_id || null,
      };
    }
  } catch (e) { console.warn('[Recognition] official match failed:', e); }
  try {
    const { data: prodRow } = await adminClient
      .from('products')
      .select('*')
      .eq('category', category)
      .ilike('name', `%${keyword}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prodRow) {
      return {
        result: productRowToResult(prodRow),
        source: 'history' as const,
        cached_at: prodRow.created_at,
        product_id: prodRow.id,
      };
    }
  } catch (e) { console.warn('[Recognition] history match failed:', e); }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  console.log('[Recognition] === request received ===');
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
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: '无法获取权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userRole = roleData.role;
    if (userRole !== 'admin' && userRole !== 'anchor') {
      return new Response(JSON.stringify({ error: '没有识别权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { imageBase64, images, imageHash, forceRefresh } = body as {
      imageBase64?: string; images?: string[]; imageHash?: string; forceRefresh?: boolean;
    };
    const imageList: string[] = Array.isArray(images) && images.length > 0
      ? images.slice(0, 5)
      : (imageBase64 ? [imageBase64] : []);
    if (imageList.length === 0) {
      return new Response(JSON.stringify({ error: '请提供商品图片' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ① 图像哈希精确命中
    if (!forceRefresh && imageHash) {
      const { data: hit } = await adminClient
        .from('products')
        .select('*')
        .eq('image_hash', imageHash)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hit) {
        const recentPrice = await loadRecentPrice(adminClient, hit.id);
        const cached = productRowToResult(hit);
        console.log('[Recognition] cache hit (hash) → skip AI');
        return new Response(JSON.stringify({
          ...cached,
          fromCache: true,
          cacheSource: 'hash',
          cachedAt: hit.created_at,
          cachedProductId: hit.id,
          imageHash,
          recentPrice,
          __pipeline: {
            source: 'hash_cache',
            cacheSource: 'hash',
            webSearchEnabled: false,
            webSearchUsed: false,
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const tAfterHash = Date.now();
    const multiImage = imageList.length > 1;
    const [modelCfg, knowledgeContext] = await Promise.all([
      resolveModelConfig(adminClient, multiImage),
      loadKnowledgeContext(adminClient),
    ]);
    const tAfterSettings = Date.now();
    console.log('[Timing] settings+knowledge:', tAfterSettings - tAfterHash, 'ms');
    console.log('[Recognition] model=', modelCfg.model, 'webSearch=', modelCfg.enableWebSearch, 'quickMatch=', modelCfg.enableQuickMatch);

    if (!Deno.env.get('LOVABLE_API_KEY')) {
      return new Response(JSON.stringify({ error: 'AI 服务未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ② 名称+类目模糊命中（默认关，可在后台开启）
    if (!forceRefresh && modelCfg.enableQuickMatch) {
      const tQ0 = Date.now();
      try {
        const quick = await tryQuickClassify(imageList);
        console.log('[Timing] quickClassify:', Date.now() - tQ0, 'ms', quick ? `→ ${quick.name}` : '(no result)');
        if (quick?.name && quick?.category) {
          const nameMatch = await tryNameMatch(adminClient, quick.name, quick.category);
          if (nameMatch) {
            const recentPrice = nameMatch.product_id
              ? await loadRecentPrice(adminClient, nameMatch.product_id)
              : null;
            console.log('[Recognition] cache hit (name)', nameMatch.source, '→ skip main AI');
            return new Response(JSON.stringify({
              ...nameMatch.result,
              fromCache: true,
              cacheSource: nameMatch.source,
              cachedAt: nameMatch.cached_at,
              cachedProductId: nameMatch.product_id,
              imageHash,
              recentPrice,
              __pipeline: {
                source: 'name_cache',
                cacheSource: nameMatch.source,
                webSearchEnabled: modelCfg.enableWebSearch,
                webSearchUsed: false,
              },
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      } catch (e) {
        console.warn('[Recognition] quick classify failed, fallback to full AI:', e);
      }
    }

    const startTime = Date.now();

    const recognitionPrompt = `你是日本中古杂货资深鉴定师。看图后调用 submit_recognition 工具提交。

【硬规则】
1. 全简体中文，外文品牌音译（Sony→索尼）。
2. 看不清写"不详"，宁缺勿编。confidence 如实给。
3. 禁用空话：非常精美/极具价值/匠心独运。
4. sellingPoints 恰好 3 条，tag 必须是 身世/工艺/稀缺/场景。每条 ≤22 字。
5. pitch.opener ≤30 字，pitch.highlight ≤45 字。不要写长故事——长故事另有流程补充。
${knowledgeContext}
直接调用 submit_recognition。`;

    const tAIStart = Date.now();
    // 主识别 18s 超时；504/5xx 自动重试 1 次（关闭 web search 缩短 prompt）
    let response = await callAIWithTimeout(imageList, recognitionPrompt, modelCfg, 18000);
    let aiTime = Date.now() - tAIStart;
    console.log('[Timing] mainAI:', aiTime, 'ms (model=', modelCfg.model, 'multi=', multiImage, 'web=', modelCfg.enableWebSearch, ')');

    const shouldRetry = !response.ok && (response.status === 504 || response.status >= 500) && response.status !== 402;
    if (shouldRetry) {
      console.warn('[Recognition] retry #1 because status=', response.status);
      const retryCfg: ModelConfig = { ...modelCfg, enableWebSearch: false };
      const shortPrompt = `你是日本中古杂货资深鉴定师。看图后调用 submit_recognition 工具提交。全简体中文，不详写"不详"，禁止空话。sellingPoints 恰好 3 条，每条 ≤22 字。pitch.opener ≤30 字, pitch.highlight ≤45 字。`;
      const tRetry = Date.now();
      response = await callAIWithTimeout(imageList, shortPrompt, retryCfg, 16000);
      aiTime = Date.now() - tAIStart;
      console.log('[Timing] mainAI retry:', Date.now() - tRetry, 'ms, status=', response.status);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Recognition] AI error:', response.status, errorText.slice(0, 300));
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试', retryable: true }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 额度不足，请充值', retryable: false }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const isTimeout = response.status === 504;
      return new Response(JSON.stringify({
        error: isTimeout ? '网络较慢，AI 识别超时，请检查信号或重拍后再试' : 'AI 识别失败，请重试',
        retryable: true,
      }), {
        status: response.status >= 500 ? response.status : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    let usedWebSearch = false;
    const grounding = message?.grounding_metadata
      ?? data.choices?.[0]?.grounding_metadata
      ?? message?.groundingMetadata;
    if (grounding) {
      usedWebSearch = true;
      const queries = grounding.web_search_queries ?? grounding.webSearchQueries ?? [];
      console.log('[Recognition] 🌐 grounded via google_search, queries:', JSON.stringify(queries).slice(0, 200));
    }

    let result: any = null;
    const toolCalls = message?.tool_calls || [];
    const submitCall = toolCalls.find((tc: any) => tc?.function?.name === 'submit_recognition') || toolCalls[0];
    if (submitCall?.function?.arguments) {
      result = safeParseJSON(submitCall.function.arguments);
    }
    if (!result) {
      const content = message?.content;
      if (!content) {
        console.error('[Recognition] empty response, raw:', JSON.stringify(data).slice(0, 500));
        return new Response(JSON.stringify({ error: 'AI 返回空响应，请重试' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      result = safeParseJSON(content);
      if (!result) {
        console.error('[Recognition] parse failed. Content:', content);
        return new Response(JSON.stringify({
          error: `AI 返回格式异常：${String(content).slice(0, 80)}...`,
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (!result.name) result.name = '未知商品';
    if (typeof result.confidence !== 'number') result.confidence = 0.7;
    result.fromCache = false;
    result.usedWebSearch = usedWebSearch;
    if (imageHash) result.imageHash = imageHash;

    result.__pipeline = {
      source: 'lovable_gemini',
      model: modelCfg.model,
      webSearchEnabled: modelCfg.enableWebSearch,
      webSearchUsed: usedWebSearch,
      aiTimeMs: aiTime,
    };

    const totalTime = Date.now() - startTime;
    console.log('[Recognition]', result.name, 'conf:', result.confidence, 'web:', usedWebSearch, 'Total:', totalTime, 'ms');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Recognition] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : '识别失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
