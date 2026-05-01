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
}

type Precision = 'economy' | 'standard' | 'high';
const PRECISION_MODEL: Record<Precision, string> = {
  economy: 'google/gemini-2.5-flash-lite',
  standard: 'google/gemini-2.5-flash',
  high: 'google/gemini-2.5-pro',
};
const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

async function resolveModelConfig(adminClient: any, multiImage: boolean): Promise<ModelConfig> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  let provider: 'lovable' | 'custom' = 'lovable';
  let precision: Precision = 'standard';
  let lovableModel: string | null = null;
  let custom: any = null;

  try {
    const { data } = await adminClient
      .from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
    const v = data?.value;
    if (v) {
      provider = v.provider === 'custom' ? 'custom' : 'lovable';
      precision = (['economy', 'standard', 'high'] as Precision[]).includes(v.precision)
        ? v.precision : 'standard';
      lovableModel = v.model || null;
      custom = v.custom || null;
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
    };
  }

  // 多角度模式自动升一档（standard -> high）
  let model: string;
  if (lovableModel && lovableModel.startsWith('google/gemini')) {
    // 用户在后台明确选过具体型号 -> 尊重选择
    model = lovableModel;
    if (multiImage && model === PRECISION_MODEL.economy) {
      model = PRECISION_MODEL.standard;
    }
  } else {
    model = PRECISION_MODEL[precision];
    if (multiImage && precision === 'standard') {
      model = PRECISION_MODEL.high;
    }
  }

  return { url: LOVABLE_URL, apiKey: lovableKey, model, jsonMode: true };
}

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
    ? `以下为同一件中古商品的 ${imageUrls.length} 张多角度照片，请综合判断后仅返回JSON。`
    : '请鉴定这件中古商品，仅返回JSON。';

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
  if (cfg.jsonMode) body.response_format = { type: 'json_object' };

  return await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
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
    const { imageBase64, images } = body as { imageBase64?: string; images?: string[] };
    const imageList: string[] = Array.isArray(images) && images.length > 0
      ? images.slice(0, 5)
      : (imageBase64 ? [imageBase64] : []);
    if (imageList.length === 0) {
      return new Response(JSON.stringify({ error: '请提供商品图片' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
2. **不确定原则**：宁可写"不详"也不要瞎编。
   - name：只能确定大类时，就写大类，如"青花瓷碗""日本古布丁碗"，不要编年号窑口（不要写"清乾隆景德镇青花缠枝莲纹碗"这种凭空虚构）。
   - era/origin/material/craft：观察不到明确证据就写"不详"。
   - 只有底款清晰可辨、或器型/工艺特征非常典型时，才能给出具体窑口/年代。
3. confidence 必须如实自评：
   - ≥0.85 = 看到明确底款/铭文/IP 标识
   - 0.6-0.85 = 工艺/器型特征典型，能判定大类
   - <0.6 = 仅能识别为某品类的普通商品
4. sellingPoints：3 条短句，全部中文，直击购买动机（稀缺性/工艺/年代/IP 价值），避免空话。
5. description ≤80 字，客观描述，不夸张。
${knowledgeContext}
【输出格式】仅返回如下 JSON，不加任何解释：
{"name":"","category":"jp_porcelain|eu_porcelain|incense|antique_art|local_craft|anime_toy|otaku_goods|luxury|vintage_jewelry|game_console|walkman|ccd|media_record|playback_device|home_appliance|hobby|other","era":"","origin":"","material":"","craft":"","sellingPoints":["","",""],"description":"","tips":"","confidence":0.0}`;

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
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: 'AI 返回空响应' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (!result) throw new Error('No JSON');
    } catch (parseError) {
      console.error('[Recognition] parse error:', parseError, 'Content:', content);
      return new Response(JSON.stringify({ rawContent: content, error: '解析失败' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 兜底：缺字段时写不详
    if (!result.name) result.name = '未知商品';
    if (typeof result.confidence !== 'number') result.confidence = 0.7;
    result.fromCache = false;

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
