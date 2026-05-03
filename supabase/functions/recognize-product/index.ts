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
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const HIGH_MODEL = 'google/gemini-2.5-pro';
const LITE_MODEL = 'google/gemini-2.5-flash-lite';

interface ModelConfig {
  model: string;
  enableWebSearch: boolean;
  enableQuickMatch: boolean;
}

async function resolveModelConfig(adminClient: any, _multiImage: boolean): Promise<ModelConfig> {
  let model = DEFAULT_MODEL;
  let enableWebSearch = false;     // 默认关：联网会让单次识别多 5-15s
  let enableQuickMatch = false;    // 默认关：多一次 lite AI 调用，店内大多没有重复
  try {
    const { data } = await adminClient
      .from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
    const v = data?.value;
    if (v) {
      if (typeof v.model === 'string' && ALLOWED_MODELS.has(v.model)) {
        model = v.model;
      }
      if (typeof v.enableWebSearch === 'boolean') {
        enableWebSearch = v.enableWebSearch;
      }
      if (typeof v.enableQuickMatch === 'boolean') {
        enableQuickMatch = v.enableQuickMatch;
      }
    }
  } catch (e) {
    console.warn('[Recognition] settings load failed, using defaults:', e);
  }
  // 多角度拍照不再强制升 pro，保持用户选择的模型；用户主动选 pro 才走 pro
  return { model, enableWebSearch, enableQuickMatch };
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
          minItems: 3,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string', enum: ['身世', '工艺', '稀缺', '场景'] },
              text: { type: 'string', description: '≤28汉字，写完整一句话' },
            },
            required: ['tag', 'text'],
          },
        },
        pitch: {
          type: 'object',
          properties: {
            opener: { type: 'string', description: '≤35字开场句，含品类+年代/产地，可加一个钩子，结尾句号' },
            highlight: { type: 'string', description: '≤55字亮点句，讲为什么值得，结尾句号' },
            story: { type: 'string', description: '80-140字口语化故事段，店员逐字念给客人听，10-15秒讲完。讲产地/作家/年代背景，或同款行情对比，必须像真人说话' },
          },
          required: ['opener', 'highlight', 'story'],
        },
        description: { type: 'string', description: '120-200字客观长描述，给详情页用' },
        tips: {
          type: 'object',
          properties: {
            memory: { type: 'string', description: '≤25字记忆口诀' },
            objection: { type: 'string', description: '≤60字顾客砍价/质疑应答，要完整一句话' },
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
- 瓷器：圈足修足是否规整、底款（汉字/落款/印章）、釉色、开片/冰裂、画工笔触、器型、青花发色
- 漆器：胎体、表面莳绘/雕刻、漆光老化痕迹
- 铜/铁器：铜色与包浆、铸造工艺、铭文落款
- 动漫周边：IP 名称、年份、限定标识

【硬性输出规则·必须遵守】
1. 全部字段使用简体中文，禁止出现英文/日文假名/拼音占位。外文品牌必须翻译或音译（Yonex→尤尼克斯、Snoopy→史努比、SONY→索尼），型号编号可保留数字+字母。
2. **不确定原则**：宁可写"不详"也不要瞎编。name 只能确定大类时就写大类；era/origin/material/craft 观察不到证据写"不详"。
3. confidence 如实自评：≥0.85 看到明确底款/铭文；0.6-0.85 工艺特征典型；<0.6 仅识别出大类。
4. **专业用词**：使用行业术语（釉下彩/描金/包浆/落款/限定再版/完品/初版/绝版/未拆封）。**禁用空话黑名单**：非常精美、极具价值、值得收藏、匠心独运、巧夺天工、美轮美奂、独一无二（除非确有"限定 1 件"等证据）。能给数字就给数字。
5. **sellingPoints**：返回 3-5 条带标签对象，每条 text ≤28 个汉字，写完整一句话。tag 必须是以下四类之一：
   - "身世"：年代/产地/窑口/IP/作家
   - "工艺"：关键技法/材质亮点
   - "稀缺"：限定/绝版/存世量/完品标记
   - "场景"：使用建议/收藏定位/送礼场景
   无证据的类别可省略，但**总数必须 ≥3 条**——宁可写场景建议，也不要只给两条。
6. **pitch**：店员张口就讲的三段，必须像真人说话，能让客人听完心动：
   - opener ≤35 字：报身份（品类+年代/产地）+ 一个钩子（"懂行的一眼就认得"/"这种现在很难再碰到"），结尾句号。
   - highlight ≤55 字：讲为什么值得——具体工艺亮点 + 稀缺度，给数字（"昭和 40 年代""存世不到 200 件"），结尾句号。
   - **story 80-140 字**：一段口语化小故事，店员逐字念 10-15 秒。
     · 可讲：产地窑口的小典故、作家/IP 背景、同款日拍/二手平台行情、跟普通款的差异、这种器型当年怎么用。
     · 必须像跟客人聊天，可用"您看……""其实当年……""这种品相现在……"等口语连接词。
     · **严禁空话**（非常精美/极具价值/巧夺天工/匠心独运）；可以引用具体数字（年代、价格、存世量），不知道就**不要编**，转而讲场景或类比。
     · 不要用书面词如"综上所述""此件作品"。
7. **description** 120-200 字客观长描述，给详情页/分享卡用，可写得正式一点。
8. **tips**：{memory, objection}。memory ≤25 字记忆口诀；objection ≤60 字，针对顾客最可能的砍价或质疑（"是不是仿的""为什么这么贵""有没有瑕疵"），给一句完整应答。
${knowledgeContext}
${modelCfg.enableWebSearch ? `
【联网搜索规则·必须遵守】
- 你可以调用 google_search 工具来核实事实。**仅在以下情况调用**：
  · 看到外文品牌名 / 型号编号
  · 看到不熟悉的底款铭文 / 作家落款 / 窑口名
  · 看到不确定的动漫 IP / 限定标识 / 联名 logo
  · 你的内置知识不足以判断年代或产地
- 中文常见品类（普通九谷烧/有田烧/南部铁器等）且底款清晰时**不要联网**，直接答。
- 联网得到的事实必须**直接落进** name / era / origin / sellingPoints 字段，**禁止**在文字里出现"根据搜索结果""网上说"等字眼。
- 搜索完后**必须**调用 submit_recognition 工具提交最终结果。
` : ''}
请调用 submit_recognition 工具提交结果。所有字段必须遵守上述硬性输出规则。`;

    const tAIStart = Date.now();
    const response = await callAIWithTimeout(imageList, recognitionPrompt, modelCfg, 18000);
    const aiTime = Date.now() - tAIStart;
    console.log('[Timing] mainAI:', aiTime, 'ms (model=', modelCfg.model, 'multi=', multiImage, 'web=', modelCfg.enableWebSearch, ')');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Recognition] AI error:', response.status, errorText.slice(0, 300));
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
