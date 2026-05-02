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
const DOUBAO_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
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
      enableWebSearch: false, // 自定义 endpoint 不支持 google_search
    };
  }

  if (provider === 'doubao') {
    return {
      url: DOUBAO_URL,
      apiKey: doubaoKey,
      model: storedModel && storedModel.startsWith('doubao') ? storedModel : DOUBAO_DEFAULT_MODEL,
      jsonMode: true,
      supportsTools: true,
      enableWebSearch: false, // 豆包不支持 google_search
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

  return {
    url: LOVABLE_URL,
    apiKey: lovableKey,
    model,
    jsonMode: true,
    supportsTools: true,
    enableWebSearch: enableWebSearch && isGeminiModel(model),
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

async function callAI(images: string[], systemPrompt: string, cfg: ModelConfig) {
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

  // 优先用 tool calling（最稳，无 JSON 格式问题）
  if (cfg.supportsTools) {
    if (cfg.enableWebSearch) {
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
  });
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

async function tryQuickClassify(images: string[], baseCfg: ModelConfig): Promise<{ name: string; category: string; era?: string } | null> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  // 优先用 lovable economy 模型，省钱够用
  const cfg: ModelConfig = lovableKey
    ? { url: LOVABLE_URL, apiKey: lovableKey, model: 'google/gemini-2.5-flash-lite', jsonMode: true, supportsTools: true }
    : baseCfg;
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
        return new Response(JSON.stringify({
          ...cached,
          fromCache: true,
          cacheSource: 'hash',
          cachedAt: hit.created_at,
          cachedProductId: hit.id,
          imageHash,
          recentPrice,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const multiImage = imageList.length > 1;
    const [modelCfg, knowledgeContext] = await Promise.all([
      resolveModelConfig(adminClient, multiImage),
      loadKnowledgeContext(adminClient),
    ]);

    if (!modelCfg.apiKey) {
      return new Response(JSON.stringify({ error: 'AI 服务未配置，请到后台「AI 模型」设置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ====== ② 名称+类目模糊命中：用 economy 模型先做 1 次轻量分类 ======
    if (!forceRefresh) {
      try {
        const quick = await tryQuickClassify(imageList, modelCfg);
        if (quick?.name && quick?.category) {
          const nameMatch = await tryNameMatch(adminClient, quick.name, quick.category);
          if (nameMatch) {
            const recentPrice = nameMatch.product_id
              ? await loadRecentPrice(adminClient, nameMatch.product_id)
              : null;
            return new Response(JSON.stringify({
              ...nameMatch.result,
              fromCache: true,
              cacheSource: nameMatch.source,
              cachedAt: nameMatch.cached_at,
              cachedProductId: nameMatch.product_id,
              imageHash,
              recentPrice,
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
- 你可以调用 google_search 工具来核实事实。**仅在以下情况调用**：
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


    const response = await callAI(imageList, recognitionPrompt, modelCfg);
    const aiTime = Date.now() - startTime;
    console.log('[Recognition] model:', modelCfg.model, 'multi:', multiImage, 'AI time:', aiTime, 'ms');

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
    const message = data.choices?.[0]?.message;

    let result: any = null;

    // 优先读 tool_calls（结构化输出，最稳）
    const toolCall = message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      result = safeParseJSON(toolCall.function.arguments);
      if (!result) {
        console.error('[Recognition] tool_call args parse failed:', toolCall.function.arguments);
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

    // 兜底：缺字段时写不详
    if (!result.name) result.name = '未知商品';
    if (typeof result.confidence !== 'number') result.confidence = 0.7;
    result.fromCache = false;
    if (imageHash) result.imageHash = imageHash;

    const totalTime = Date.now() - startTime;
    console.log('[Recognition]', result.name, 'conf:', result.confidence, 'Total:', totalTime, 'ms');

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
