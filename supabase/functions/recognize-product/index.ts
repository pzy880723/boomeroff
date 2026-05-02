import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ModelConfig {
  url: string;
  apiKey: string;
  model: string;
  jsonMode: boolean;
  supportsTools: boolean;
  enableWebSearch: boolean;
  // 'chat' = OpenAI 兼容 /chat/completions ; 'responses' = 火山方舟 Responses API（豆包联网专用）
  apiStyle: 'chat' | 'responses';
  // 联网搜索类型：gemini 走 google_search 接地；doubao 走火山方舟 web_search 内置插件
  searchKind: 'none' | 'google_search' | 'doubao_web_search';
  // 后台保存的 provider 名称（用于 pipeline 标记 + quick_classify 一致性）
  provider: 'lovable' | 'doubao' | 'custom';
}

// 是否是支持 Google Search 接地的 Gemini 模型
function isGeminiModel(model: string): boolean {
  return model.startsWith('google/gemini');
}

type Precision = 'economy' | 'standard' | 'high';
const PRECISION_MODEL: Record<Precision, string> = {
  economy: 'google/gemini-2.5-flash-lite',
  standard: 'google/gemini-2.5-flash',
  high: 'google/gemini-2.5-pro',
};
const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DOUBAO_CHAT_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DOUBAO_RESPONSES_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DOUBAO_DEFAULT_MODEL = 'doubao-seed-1-6-250615';

async function resolveModelConfig(adminClient: any, multiImage: boolean): Promise<ModelConfig> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  const doubaoKey = Deno.env.get('DOUBAO_API_KEY') || '';
  let provider: 'lovable' | 'doubao' | 'custom' = 'lovable';
  let precision: Precision = 'standard';
  let storedModel: string | null = null;
  let custom: any = null;
  let enableWebSearch = true; // 默认开启联网搜索

  try {
    const { data } = await adminClient
      .from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
    const v = data?.value;
    if (v) {
      if (v.provider === 'custom') provider = 'custom';
      else if (v.provider === 'doubao') provider = 'doubao';
      else provider = 'lovable';
      precision = (['economy', 'standard', 'high'] as Precision[]).includes(v.precision)
        ? v.precision : 'standard';
      storedModel = v.model || null;
      custom = v.custom || null;
      if (typeof v.enableWebSearch === 'boolean') enableWebSearch = v.enableWebSearch;
    }
  } catch (e) {
    console.warn('[Recognition] settings load failed, using defaults:', e);
  }

  if (provider === 'custom' && custom?.baseUrl && custom?.apiKey && custom?.model) {
    return {
      url: `${String(custom.baseUrl).replace(/\/+$/, '')}/chat/completions`,
      apiKey: custom.apiKey,
      model: custom.model,
      jsonMode: false,
      supportsTools: true,
      enableWebSearch: false, // 自定义 endpoint 不支持联网
      apiStyle: 'chat',
      searchKind: 'none',
      provider: 'custom',
    };
  }

  if (provider === 'doubao') {
    const model = storedModel && storedModel.startsWith('doubao') ? storedModel : DOUBAO_DEFAULT_MODEL;
    // 豆包联网必须切到 Responses API
    if (enableWebSearch) {
      return {
        url: DOUBAO_RESPONSES_URL,
        apiKey: doubaoKey,
        model,
        jsonMode: false,
        supportsTools: true,
        enableWebSearch: true,
        apiStyle: 'responses',
        searchKind: 'doubao_web_search',
        provider: 'doubao',
      };
    }
    return {
      url: DOUBAO_CHAT_URL,
      apiKey: doubaoKey,
      model,
      jsonMode: true,
      supportsTools: true,
      enableWebSearch: false,
      apiStyle: 'chat',
      searchKind: 'none',
      provider: 'doubao',
    };
  }

  // 多角度模式自动升一档（standard -> high）
  let model: string;
  if (storedModel && storedModel.startsWith('google/gemini')) {
    // 用户在后台明确选过具体型号 -> 尊重选择
    model = storedModel;
    if (multiImage && model === PRECISION_MODEL.economy) {
      model = PRECISION_MODEL.standard;
    }
  } else {
    model = PRECISION_MODEL[precision];
    if (multiImage && precision === 'standard') {
      model = PRECISION_MODEL.high;
    }
  }

  const useGoogleSearch = enableWebSearch && isGeminiModel(model);
  return {
    url: LOVABLE_URL,
    apiKey: lovableKey,
    model,
    jsonMode: true,
    supportsTools: true,
    enableWebSearch: useGoogleSearch,
    apiStyle: 'chat',
    searchKind: useGoogleSearch ? 'google_search' : 'none',
    provider: 'lovable',
  };
}

// 宽容 JSON 解析：自动去尾逗号、去 markdown 代码块、提取 {...}
function safeParseJSON(raw: string): any | null {
  if (!raw) return null;
  let txt = raw.trim();
  // 去 markdown 代码块
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  // 提取最外层 {...}
  const match = txt.match(/\{[\s\S]*\}/);
  if (match) txt = match[0];
  // 去尾随逗号 ,} 或 ,]
  const cleaned = txt.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(cleaned); } catch (_) { /* fallthrough */ }
  // 最后兜底：原始 parse
  try { return JSON.parse(txt); } catch (_) { return null; }
}

// Tool calling schema：让模型按结构填参数，杜绝 JSON 格式错误
const RECOGNITION_TOOL = {
  type: 'function',
  function: {
    name: 'submit_recognition',
    description: '提交中古商品鉴定结果',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '商品名称（≤12字）' },
        category: {
          type: 'string',
          enum: ['jp_porcelain', 'eu_porcelain', 'incense', 'antique_art', 'local_craft',
                 'anime_toy', 'otaku_goods', 'luxury', 'vintage_jewelry', 'game_console',
                 'walkman', 'ccd', 'media_record', 'playback_device', 'home_appliance',
                 'hobby', 'other'],
        },
        era: { type: 'string', description: '年代，未知写"不详"' },
        origin: { type: 'string', description: '产地/窑口，未知写"不详"' },
        material: { type: 'string', description: '材质，未知写"不详"' },
        craft: { type: 'string', description: '工艺，未知写"不详"' },
        sellingPoints: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string', enum: ['身世', '工艺', '稀缺', '场景'] },
              text: { type: 'string', description: '≤18汉字' },
            },
            required: ['tag', 'text'],
          },
        },
        pitch: {
          type: 'object',
          properties: {
            opener: { type: 'string', description: '≤22字开场句，含品类+年代/产地，结尾句号' },
            highlight: { type: 'string', description: '≤28字亮点句，结尾句号' },
          },
          required: ['opener', 'highlight'],
        },
        description: { type: 'string', description: '≤80字客观长描述' },
        tips: {
          type: 'object',
          properties: {
            memory: { type: 'string', description: '≤20字记忆口诀' },
            objection: { type: 'string', description: '≤30字顾客常问应答' },
          },
        },
        confidence: { type: 'number', description: '自评置信度 0-1' },
      },
      required: ['name', 'category', 'pitch', 'confidence'],
    },
  },
};

async function loadKnowledgeContext(adminClient: any): Promise<string> {
  try {
    const { data } = await adminClient
      .from('official_knowledge')
      .select('name, category, era, origin, summary')
      .order('importance_score', { ascending: false })
      .order('view_count', { ascending: false })
      .limit(30);
    if (!data || data.length < 5) return '';
    const lines = data.map((r: any) => {
      const parts = [r.name, r.category, r.era || '', r.origin || ''].filter(Boolean);
      return `- ${parts.join(' | ')}${r.summary ? ` —— ${String(r.summary).slice(0, 40)}` : ''}`;
    });
    return `\n\n【已收录的官方知识库（识别时优先匹配，若高度相似请直接沿用名称/年代/产地）】\n${lines.join('\n')}\n`;
  } catch (e) {
    console.warn('[Recognition] knowledge load failed:', e);
    return '';
  }
}

async function callAI(images: string[], systemPrompt: string, cfg: ModelConfig, signal?: AbortSignal) {
  const imageUrls = images.map((img) =>
    img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
  );

  const userText = imageUrls.length > 1
    ? `以下为同一件中古商品的 ${imageUrls.length} 张多角度照片，请综合判断后调用 submit_recognition 工具提交结果。`
    : '请鉴定这件中古商品，调用 submit_recognition 工具提交结果。';

  // ===== 豆包 Responses API 分支（仅联网模式） =====
  if (cfg.apiStyle === 'responses') {
    return await callDoubaoResponses(imageUrls, systemPrompt, userText, cfg, signal);
  }

  // ===== 标准 chat/completions 分支 =====
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

  // 优先用 tool calling（最稳，无 JSON 格式问题）
  if (cfg.supportsTools) {
    if (cfg.searchKind === 'google_search') {
      // 联网模式：挂上 google_search，让模型自己决定先搜还是先答；
      // tool_choice=auto 才能让模型有机会调用 google_search
      body.tools = [RECOGNITION_TOOL, { type: 'google_search' }];
      body.tool_choice = 'auto';
    } else {
      body.tools = [RECOGNITION_TOOL];
      body.tool_choice = { type: 'function', function: { name: 'submit_recognition' } };
    }
  } else if (cfg.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  return await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
}

// 包一层超时；超时后伪造一个 504 Response，让上层走降级逻辑
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

// 豆包 Responses API（火山方舟 web_search 内置插件，只在联网模式走这里）
async function callDoubaoResponses(
  imageUrls: string[],
  systemPrompt: string,
  userText: string,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<Response> {
  // Responses API: input 是数组，每条 {role, content:[{type, text|image_url}]}
  const userContent: any[] = [{ type: 'input_text', text: userText }];
  for (const url of imageUrls) {
    userContent.push({ type: 'input_image', image_url: url });
  }

  // Responses API 的 function tool 是扁平结构（不嵌 function 字段）
  const recognitionToolFlat = {
    type: 'function',
    name: RECOGNITION_TOOL.function.name,
    description: RECOGNITION_TOOL.function.description,
    parameters: RECOGNITION_TOOL.function.parameters,
  };

  const body = {
    model: cfg.model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
      { role: 'user', content: userContent },
    ],
    tools: [
      { type: 'web_search', max_keyword: 2 },
      recognitionToolFlat,
    ],
    max_tool_calls: 3,
  };

  return await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
}

// 解析豆包 Responses API 返回，提取 submit_recognition 参数 + 是否联网
function parseDoubaoResponses(data: any): { result: any | null; usedWebSearch: boolean; rawHint: string } {
  let usedWebSearch = false;
  let result: any = null;
  const items = Array.isArray(data?.output) ? data.output : [];
  for (const item of items) {
    const t = item?.type;
    if (t === 'web_search_call') {
      usedWebSearch = true;
    } else if (t === 'function_call' && item?.name === 'submit_recognition') {
      const args = typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {});
      const parsed = safeParseJSON(args);
      if (parsed) result = parsed;
    } else if (t === 'message' && !result) {
      // 兜底：若模型没调用工具，直接给了文本，尝试解析
      const parts = Array.isArray(item.content) ? item.content : [];
      for (const p of parts) {
        const txt = p?.text;
        if (typeof txt === 'string') {
          const parsed = safeParseJSON(txt);
          if (parsed) { result = parsed; break; }
        }
      }
    }
  }
  // usage 维度兜底判断
  const toolUsage = data?.usage?.tool_usage;
  if (typeof toolUsage === 'number' && toolUsage > 0) usedWebSearch = true;
  return { result, usedWebSearch, rawHint: JSON.stringify(items).slice(0, 300) };
}

// ====== 缓存辅助函数 ======

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

async function tryQuickClassify(images: string[], baseCfg: ModelConfig, provider: 'lovable' | 'doubao' | 'custom'): Promise<{ name: string; category: string; era?: string } | null> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  const doubaoKey = Deno.env.get('DOUBAO_API_KEY') || '';
  // quick_classify 跟随后台 provider 选择，避免"我选了豆包但缓存判定却用 Lovable"的违和感
  let cfg: ModelConfig;
  if (provider === 'doubao' && doubaoKey) {
    cfg = { url: DOUBAO_CHAT_URL, apiKey: doubaoKey, model: 'doubao-1-5-vision-lite-32k-250115', jsonMode: true, supportsTools: true, enableWebSearch: false, apiStyle: 'chat', searchKind: 'none' };
  } else if (provider === 'custom') {
    // 自定义接口未必兼容 quick_classify，跳过
    return null;
  } else if (lovableKey) {
    cfg = { url: LOVABLE_URL, apiKey: lovableKey, model: 'google/gemini-2.5-flash-lite', jsonMode: true, supportsTools: true, enableWebSearch: false, apiStyle: 'chat', searchKind: 'none' };
  } else {
    cfg = baseCfg;
  }
  const imageUrls = images.slice(0, 1).map((img) =>
    img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
  );
  const userContent: any[] = [
    { type: 'text', text: '只判断商品的名称、类目、大致年代。调用 quick_classify 工具提交。' },
  ];
  for (const url of imageUrls) userContent.push({ type: 'image_url', image_url: { url } });
  const body: any = {
    model: cfg.model,
    messages: [
      { role: 'system', content: '你是中古商品快速分类器。只返回商品名、类目、年代，不做长描述。' },
      { role: 'user', content: userContent },
    ],
    tools: [QUICK_TOOL],
    tool_choice: { type: 'function', function: { name: 'quick_classify' } },
  };
  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  const parsed = safeParseJSON(args);
  if (!parsed?.name || !parsed?.category) return null;
  return { name: String(parsed.name), category: String(parsed.category), era: parsed.era };
}

async function tryNameMatch(adminClient: any, name: string, category: string): Promise<
  { result: any; source: 'official' | 'history'; cached_at: string; product_id: string | null } | null
> {
  // 关键词：取 name 的前 4-6 个字（中文）做 ILIKE
  const keyword = name.trim().slice(0, 6);
  if (keyword.length < 2) return null;

  // 1) 官方知识库
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
        source: 'official',
        cached_at: ofRow.updated_at || ofRow.created_at,
        product_id: ofRow.source_product_id || null,
      };
    }
  } catch (e) { console.warn('[Recognition] official match failed:', e); }

  // 2) 历史 products
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
        source: 'history',
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
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

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

    // ====== ① 图像哈希精确命中：直接返回历史 product 行 ======
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

    const multiImage = imageList.length > 1;
    const [modelCfg, knowledgeContext] = await Promise.all([
      resolveModelConfig(adminClient, multiImage),
      loadKnowledgeContext(adminClient),
    ]);
    console.log('[Recognition] resolved provider=', modelCfg.provider, 'model=', modelCfg.model, 'apiStyle=', modelCfg.apiStyle, 'webSearch=', modelCfg.enableWebSearch);

    if (!modelCfg.apiKey) {
      return new Response(JSON.stringify({ error: 'AI 服务未配置，请到后台「AI 模型」设置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ====== ② 名称+类目模糊命中：用 economy 模型先做 1 次轻量分类 ======
    if (!forceRefresh) {
      try {
        const quick = await tryQuickClassify(imageList, modelCfg, modelCfg.provider);
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
                quickClassifyProvider: modelCfg.provider,
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

    const recognitionPrompt = `你是一位资深的日本中古杂货鉴定师，深谙以下品类：
- 日本瓷器：有田烧/伊万里/九谷烧/京烧/清水烧/萨摩烧/美浓烧/濑户烧
- 欧洲瓷器：迈森/皇家哥本哈根/韦奇伍德/罗斯兰
- 中国瓷器：景德镇青花/粉彩/釉里红
- 漆器：轮岛涂/会津涂/津轻涂/莳绘
- 铜器/银器/锡器/铁器（南部铁器/铸铁壶）
- 香道具：香炉/香盒/沉香/伽罗
- 古美术：浮世绘/挂轴/书画/陶印
- 民艺：竹编/草木染/和纸
- 动漫周边/手办/扭蛋/景品/海外限定
- 御宅向：偶像痛包/痛车贴/抱枕/Cosplay 道具
- 奢侈品：香奈儿/爱马仕/路易威登/卡地亚/劳力士
- 复古首饰：明治大正昭和银饰/珐琅胸针/天然珍珠
- 游戏机/Walkman/CCD 数码相机/卡带/CD/黑胶/老式播放器/家电
- 兴趣类：球拍/钓具/相机镜头/钢笔/打火机/古董表

【鉴定线索清单（请观察后判断）】
- 瓷器：圈足修足是否规整、底款（汉字/落款/印章）、釉色（青白/卵白/影青/红釉）、开片/冰裂、画工笔触、器型（碗/盘/壶/瓶/酒器）、青花发色（明蓝/灰蓝/黑蓝）
- 漆器：胎体（木/合成）、表面莳绘/雕刻、漆光老化痕迹
- 铜/铁器：铜色与包浆（红铜/黄铜/青铜/朱泥）、铸造工艺、铭文落款
- 动漫周边：IP 名称（一拳超人/海贼王/灌篮高手等）、年份、限定标识

【硬性输出规则·必须遵守】
1. 全部字段使用简体中文，禁止出现英文/日文假名/拼音占位。外文品牌必须翻译或音译（Yonex→尤尼克斯、Snoopy→史努比、SONY→索尼），型号编号可保留数字+字母。
2. **不确定原则**：宁可写"不详"也不要瞎编。name 只能确定大类时就写大类；era/origin/material/craft 观察不到证据写"不详"。
3. confidence 如实自评：≥0.85 看到明确底款/铭文；0.6-0.85 工艺特征典型；<0.6 仅识别出大类。
4. **专业用词**：使用行业术语（釉下彩/描金/包浆/落款/限定再版/完品/初版/绝版/未拆封）。**禁用空话黑名单**：非常精美、极具价值、值得收藏、匠心独运、巧夺天工、美轮美奂、独一无二（除非确有"限定 1 件"等证据）。能给数字就给数字（"昭和 40 年代"优于"昭和年间"）。
5. **sellingPoints**：返回 2-3 条带标签对象，每条 text ≤18 个汉字。tag 必须是以下四类之一：
   - "身世"：年代/产地/窑口/IP/作家
   - "工艺"：关键技法/材质亮点
   - "稀缺"：限定/绝版/存世量/完品标记
   - "场景"：使用建议/收藏定位/送礼场景
   无证据的类别**整条省略**，不要凑数，不要硬编。
6. **pitch**：店员张口就能念的两句口语：
   - opener ≤22 字，先报身份（含品类+年代/产地，结尾句号）。例「这是昭和年间的九谷烧赤绘小皿。」
   - highlight ≤28 字，讲为什么值得（具体特征+稀缺度，结尾句号）。例「红绘金彩全手绘，盘底有匠人落款。」
   两句必须是完整可朗读的句子，不出现冒号/括号/引号/JSON 残片。
7. **description** ≤80 字客观长描述，仅作为详情页备份，不夸张。
8. **tips**：返回对象 {memory, objection}：
   - memory ≤20 字，给店员的记忆口诀（如"认准盘底九谷二字红款"）
   - objection ≤30 字，顾客常问应答（如"问真假？盘底落款+金彩磨损是真品标志"）
   无内容的字段省略，不要硬编。
${knowledgeContext}
${modelCfg.enableWebSearch ? `
【联网搜索规则·必须遵守】
- 你可以调用 ${modelCfg.searchKind === 'doubao_web_search' ? 'web_search' : 'google_search'} 工具来核实事实。**仅在以下情况调用**：
  · 看到外文品牌名 / 型号编号（SONY WM-XXX、Nikon EM 等）
  · 看到不熟悉的底款铭文 / 作家落款 / 窑口名
  · 看到不确定的动漫 IP / 限定标识 / 联名 logo
  · 你的内置知识不足以判断年代或产地
- 中文常见品类（普通九谷烧/有田烧/南部铁器等）且底款清晰时**不要联网**，直接答，省时间。
- 搜索关键词用「品牌型号 + 中古 / 年代 / 価格」之类组合，最多搜 2 次。
- 联网得到的事实必须**直接落进** name / era / origin / sellingPoints 字段，**禁止**在文字里出现"根据搜索结果""网上说""维基百科显示"等字眼。
- 搜索完后**必须**调用 submit_recognition 工具提交最终结果。
` : ''}
请调用 submit_recognition 工具提交结果。所有字段必须遵守上述硬性输出规则。`;


    // 检查最近是否记录到「豆包联网未开通」，若是直接跳过 Responses 路径，避免每次都等 30 秒
    let webSearchDisabledReason: string | null = null;
    if (modelCfg.apiStyle === 'responses') {
      try {
        const { data: flagRow } = await adminClient
          .from('app_settings').select('value').eq('key', 'doubao_web_search_status').maybeSingle();
        const flag = flagRow?.value;
        if (flag?.disabled === true) {
          webSearchDisabledReason = flag.reason || '豆包联网搜索未开通';
          console.warn('[Recognition] doubao web_search marked disabled, skipping Responses API:', webSearchDisabledReason);
        }
      } catch (_) { /* noop */ }
    }

    let activeCfg: ModelConfig = modelCfg;
    if (webSearchDisabledReason && modelCfg.apiStyle === 'responses') {
      activeCfg = {
        ...modelCfg,
        url: DOUBAO_CHAT_URL,
        apiStyle: 'chat',
        searchKind: 'none',
        enableWebSearch: false,
        jsonMode: true,
      };
    }

    let response = await callAIWithTimeout(imageList, recognitionPrompt, activeCfg, 25000);
    let aiTime = Date.now() - startTime;
    console.log('[Recognition] model:', activeCfg.model, 'apiStyle:', activeCfg.apiStyle, 'searchKind:', activeCfg.searchKind, 'multi:', multiImage, 'AI time:', aiTime, 'ms');

    // 豆包 Responses API 失败 → 自动降级到 chat/completions（不联网，但保住识别）
    if (!response.ok && activeCfg.apiStyle === 'responses') {
      const errText = await response.text();
      console.warn('[Recognition] Doubao Responses failed, fallback to chat/completions:', response.status, errText.slice(0, 300));

      // 识别「web_search 插件未开通」类错误，落库以便后续直接跳过 Responses 路径
      const looksLikeToolNotOpen = response.status === 404
        && /ToolNotOpen|web[_ ]?search|activate.*web search/i.test(errText);
      if (looksLikeToolNotOpen) {
        webSearchDisabledReason = '豆包账号未开通联网搜索插件，已自动改用普通识别';
        try {
          await adminClient.from('app_settings').upsert({
            key: 'doubao_web_search_status',
            value: { disabled: true, reason: webSearchDisabledReason, detected_at: new Date().toISOString() },
          });
        } catch (e) { console.warn('[Recognition] failed to persist web_search_status:', e); }
      } else {
        webSearchDisabledReason = `豆包联网调用失败（${response.status}），已自动改用普通识别`;
      }

      const fallbackCfg: ModelConfig = {
        ...modelCfg,
        url: DOUBAO_CHAT_URL,
        apiStyle: 'chat',
        searchKind: 'none',
        enableWebSearch: false,
        jsonMode: true,
      };
      response = await callAIWithTimeout(imageList, recognitionPrompt, fallbackCfg, 25000);
      activeCfg = fallbackCfg;
      aiTime = Date.now() - startTime;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Recognition] AI error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 额度不足，请充值' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI 识别失败，请重试' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    let result: any = null;
    let usedWebSearch = false;

    if (activeCfg.apiStyle === 'responses') {
      // ===== 豆包 Responses API 解析 =====
      const parsed = parseDoubaoResponses(data);
      result = parsed.result;
      usedWebSearch = parsed.usedWebSearch;
      if (usedWebSearch) {
        console.log('[Recognition] 🌐 grounded via Doubao web_search, tool_usage:', data?.usage?.tool_usage ?? '?');
        // 真的联网成功 → 清掉之前可能存在的「未开通」标记
        try {
          await adminClient.from('app_settings').upsert({
            key: 'doubao_web_search_status',
            value: { disabled: false, recovered_at: new Date().toISOString() },
          });
        } catch (_) { /* noop */ }
      }
      if (!result) {
        console.error('[Recognition] Doubao Responses parse failed. hint:', parsed.rawHint);
        return new Response(JSON.stringify({ error: 'AI 返回空响应，请重试' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // ===== 标准 chat/completions 解析 =====
      const message = data.choices?.[0]?.message;

      // 联网搜索使用情况日志（不暴露给前端）
      const grounding = message?.grounding_metadata
        ?? data.choices?.[0]?.grounding_metadata
        ?? message?.groundingMetadata;
      if (grounding) {
        usedWebSearch = true;
        const queries = grounding.web_search_queries
          ?? grounding.webSearchQueries
          ?? [];
        console.log('[Recognition] 🌐 grounded via google_search, queries:', JSON.stringify(queries).slice(0, 200));
      }

      // 优先读 submit_recognition tool_call
      const toolCalls = message?.tool_calls || [];
      const submitCall = toolCalls.find((tc: any) => tc?.function?.name === 'submit_recognition') || toolCalls[0];
      if (submitCall?.function?.arguments) {
        result = safeParseJSON(submitCall.function.arguments);
        if (!result) {
          console.error('[Recognition] tool_call args parse failed:', submitCall.function.arguments);
        }
      }

      // 回退：从 content 字段解析
      if (!result) {
        const content = message?.content;
        if (!content) {
          console.error('[Recognition] empty response, raw data:', JSON.stringify(data).slice(0, 500));
          return new Response(JSON.stringify({ error: 'AI 返回空响应，请重试' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        result = safeParseJSON(content);
        if (!result) {
          console.error('[Recognition] parse failed. Content:', content);
          return new Response(JSON.stringify({
            error: `AI 返回格式异常：${String(content).slice(0, 80)}...`,
            rawContent: content,
          }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 兜底：缺字段时写不详
    if (!result.name) result.name = '未知商品';
    if (typeof result.confidence !== 'number') result.confidence = 0.7;
    result.fromCache = false;
    result.usedWebSearch = usedWebSearch;
    if (imageHash) result.imageHash = imageHash;

    // 路径元数据：让前端能一眼看到本次到底用了哪条 AI 链路
    const pipelineSource =
      activeCfg.apiStyle === 'responses' ? 'doubao_responses'
      : activeCfg.provider === 'doubao' ? 'doubao_chat'
      : activeCfg.provider === 'custom' ? 'custom'
      : 'lovable_gemini';
    result.__pipeline = {
      source: pipelineSource,
      provider: activeCfg.provider,
      model: activeCfg.model,
      webSearchEnabled: modelCfg.enableWebSearch,
      webSearchUsed: usedWebSearch,
      aiTimeMs: aiTime,
      degraded: activeCfg !== modelCfg, // 是否走了降级路径
    };

    const totalTime = Date.now() - startTime;
    console.log('[Recognition]', result.name, 'conf:', result.confidence, 'web:', usedWebSearch, 'pipeline:', pipelineSource, 'Total:', totalTime, 'ms');

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
