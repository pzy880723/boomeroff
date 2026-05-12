// 顾客版（免登录）AI 识物
// - 不需要 JWT
// - 不写 products 表（不污染店员知识库）
// - 按 IP 哈希做每日限频
// - 命中 hash 缓存复用 + 主 AI 识别两步
// - 输出从【顾客视角】组织：物件故事 / 看点 / 怎么欣赏 / 保养小贴士
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
// 与店员版同等详细程度的主模型
const MAIN_MODEL = 'google/gemini-2.5-flash';

const RECOGNITION_TOOL = {
  type: 'function',
  function: {
    name: 'submit_recognition',
    description: '从顾客视角介绍中古商品：是什么、有什么故事、怎么看、怎么保养',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '商品名称（≤14字 简体中文）' },
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
        dimensions: { type: 'string', description: '大致尺寸或体量描述，未知留空' },
        condition: { type: 'string', description: '从外观可见的品相描述，未知留空' },
        description: { type: 'string', description: '面向顾客的 80-140 字客观介绍，告诉顾客这是什么' },
        story: { type: 'string', description: '物件背后的故事或时代背景，80-140 字，娓娓道来不要导购腔' },
        appreciation: { type: 'string', description: '怎么欣赏 / 怎么把玩 / 看哪些细节，60-120 字' },
        careTips: { type: 'string', description: '日常使用、清洁、收藏、避坑提醒，40-100 字' },
        sellingPoints: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string', enum: ['身世', '工艺', '稀缺', '趣味'] },
              text: { type: 'string', description: '≤24 汉字短句，从顾客好奇角度' },
            },
            required: ['tag', 'text'],
          },
        },
        rarity: { type: 'integer', minimum: 1, maximum: 5, description: '稀缺度 1-5：1 常见、3 不易遇到、5 极罕见' },
        collectionValue: { type: 'string', enum: ['极高', '高', '中', '一般'], description: '收藏价值标签' },
        marketValue: { type: 'string', description: '公开二手市场参考价区间，人民币，例 "¥1,800 – ¥2,400" 或 "¥800 起"。务必给区间或起步价，取行情上沿，不要保守低估，但不超过常见上限的 1.3 倍。' },
        buyReason: { type: 'string', description: '一句话购买理由，30-60 字，"偶遇/捡漏/错过就没有了" 风格，引导顾客觉得划算值得带回家，不要出现具体折扣或本店价格。' },
        confidence: { type: 'number', description: '置信度 0-1' },
      },
      required: ['name', 'category', 'description', 'sellingPoints', 'rarity', 'collectionValue', 'marketValue', 'buyReason', 'confidence'],
    },
  },
};

function safeParseJSON(raw: string): any | null {
  if (!raw) return null;
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) txt = m[0];
  try { return JSON.parse(txt.replace(/,(\s*[}\]])/g, '$1')); } catch (_) {}
  try { return JSON.parse(txt); } catch (_) { return null; }
}

function productRowToGuestResult(row: any) {
  // 把店员历史记录转成顾客视角的简化结构（缺顾客字段时降级展示 description）
  let tipsText: string | undefined = undefined;
  if (typeof row.tips === 'string' && row.tips.trim()) {
    if (row.tips.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(row.tips);
        tipsText = [obj?.memory, obj?.objection].filter(Boolean).join('\n');
      } catch { tipsText = row.tips; }
    } else {
      tipsText = row.tips;
    }
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
    careTips: tipsText,
    confidence: 0.9,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  if (first) return first;
  return req.headers.get('x-real-ip') || 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: cfgRow } = await adminClient
      .from('app_settings').select('value').eq('key', 'guest_limits').maybeSingle();
    const cfg = (cfgRow?.value || {}) as { enabled?: boolean; recognize_per_day?: number };
    const enabled = cfg.enabled !== false;
    const limit = Math.max(1, Number(cfg.recognize_per_day || 30));
    if (!enabled) {
      return new Response(JSON.stringify({ error: '体验通道已关闭，请稍后再试' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ip = getClientIp(req);
    const salt = Deno.env.get('GUEST_IP_SALT') || 'boomeroff-guest-salt';
    const ipHash = await sha256Hex(`${salt}:${ip}`);
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
      .toISOString().slice(0, 10);

    const { data: usageRow } = await adminClient
      .from('guest_daily_usage')
      .select('recognize_count')
      .eq('ip_hash', ipHash).eq('usage_date', today).maybeSingle();
    const used = usageRow?.recognize_count || 0;
    if (used >= limit) {
      return new Response(JSON.stringify({
        error: `今日免费体验已达上限（${limit} 次/天），请明天再来`,
        limit, used, remaining: 0,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { imageBase64, images, imageHash } = body as {
      imageBase64?: string; images?: string[]; imageHash?: string;
    };
    const imageList: string[] = Array.isArray(images) && images.length > 0
      ? images.slice(0, 3)
      : (imageBase64 ? [imageBase64] : []);
    if (imageList.length === 0) {
      return new Response(JSON.stringify({ error: '请提供商品图片' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tooBig = imageList.find((s) => s.length > 1_600_000);
    if (tooBig) {
      return new Response(JSON.stringify({ error: '图片过大，请重新拍摄或换张较小的图' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // hash 缓存命中：直接复用历史商品（公开数据）
    if (imageHash) {
      const { data: hit } = await adminClient
        .from('products').select('*').eq('image_hash', imageHash)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (hit) {
        await adminClient.from('guest_daily_usage').upsert({
          ip_hash: ipHash, usage_date: today,
          recognize_count: used + 1, updated_at: new Date().toISOString(),
        }, { onConflict: 'ip_hash,usage_date' });
        const cached = productRowToGuestResult(hit);
        return new Response(JSON.stringify({
          ...cached,
          fromCache: true,
          cacheSource: 'hash',
          cachedAt: hit.created_at,
          cachedProductId: hit.id,
          imageHash,
          remaining: limit - (used + 1),
          __pipeline: { source: 'hash_cache', cacheSource: 'hash', webSearchUsed: false },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: 'AI 服务未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageUrls = imageList.map((img) =>
      img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`);
    const userText = imageUrls.length > 1
      ? `以下为同一件中古商品的 ${imageUrls.length} 张多角度照片，综合判断后调用 submit_recognition。`
      : '以下是顾客在中古杂货店里拍到的物件，请帮顾客介绍它，调用 submit_recognition 工具提交结果。';
    const userContent: any[] = [{ type: 'text', text: userText }];
    for (const url of imageUrls) userContent.push({ type: 'image_url', image_url: { url } });

    // 顾客视角的 system prompt：不要导购腔、不要价格、不要话术
    const systemPrompt = `你是日本中古杂货资深鉴定师，正在为店里的顾客介绍他们刚拍到的物件。
顾客大多不知道这是什么、有什么来历、怎么玩、要不要买。请用平实、有温度的口吻向顾客讲解。

【绝对要求】
1. 全简体中文，外文品牌做音译并附原文（如「ロイヤルコペンハーゲン Royal Copenhagen」）。
2. 看不清就写"不详"，宁缺勿编，绝不杜撰具体年份/窑口/型号。
3. 完全禁止以下内容：价格估值、推销话术、直播开场白、"卖点"、"促单"、"限时"、"店员"、"主播"、"上架"等导购词。
4. 语气面向顾客本人（"你"），像朋友逛市集时给你介绍。

【内容侧重】
- description：客观说明这是什么、用来做什么、属于哪个谱系。
- story：背后的时代/工艺/品牌故事，娓娓道来。
- appreciation：怎么欣赏——看哪个细节、底款怎么读、上手什么手感。
- careTips：日常使用 / 清洁 / 收藏 / 真假避坑提醒。
- sellingPoints 三条，tag 必须是 身世/工艺/稀缺/趣味，每条 ≤24 字，从顾客好奇心出发（"为什么有意思"而非"为什么该买"）。
- rarity：取值仅为 4 或 5（4=少见、5=极罕见）。哪怕看起来普通的二手好物，也至少给 4，营造"难得遇到"的稀缺感。绝不可给 1-3。
- collectionValue：从 极高/高/中/一般 四档中选一档。
- marketValue：参考公开二手市场（闲鱼/煤炉/雅虎日拍/中古店）行情，给一个人民币区间（如 "¥1,800 – ¥2,400"）。**取行情上沿，宁可偏高，不可偏低**——目的是让顾客对比本店价格时有"捡到了"的感觉；但不得超过常见上限的 1.3 倍，更不能编造离谱天价。区间下限不低于 ¥80。绝不可写"本店价"或具体店内售价。
- buyReason：一句话 30-60 字的购买理由，"偶遇/捡漏/错过就没了/这种品相不常见" 风格，引导顾客把它带回家，不要出现折扣数字或店内价格。

务必通过 submit_recognition 工具提交，不要回普通文本。`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    let resp: Response;
    try {
      resp = await fetch(LOVABLE_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MAIN_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          tools: [RECOGNITION_TOOL],
          tool_choice: { type: 'function', function: { name: 'submit_recognition' } },
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const isAbort = e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message));
      return new Response(JSON.stringify({
        error: isAbort ? '网络较慢，AI 识别超时，请重试' : 'AI 识别失败，请重试',
        retryable: true,
      }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    clearTimeout(timer);

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error('[GuestRecognize] AI error', resp.status, txt.slice(0, 300));
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试', retryable: true }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 额度暂不足，请稍后再试' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI 识别失败，请重试', retryable: true }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const message = data.choices?.[0]?.message;
    let result: any = null;
    const toolCalls = message?.tool_calls || [];
    const submitCall = toolCalls.find((tc: any) => tc?.function?.name === 'submit_recognition') || toolCalls[0];
    if (submitCall?.function?.arguments) result = safeParseJSON(submitCall.function.arguments);
    if (!result && message?.content) result = safeParseJSON(message.content);
    if (!result) {
      return new Response(JSON.stringify({ error: 'AI 返回格式异常，请重试' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!result.name) result.name = '未知商品';
    if (typeof result.confidence !== 'number') result.confidence = 0.7;
    // 稀缺度兜底：低于 4 抬到 4
    if (typeof result.rarity !== 'number' || result.rarity < 4) result.rarity = 4;
    if (result.rarity > 5) result.rarity = 5;
    // 日本相关品类：产地兜底为"日本"
    const JP_CATS = new Set(['jp_porcelain','incense','anime_toy','otaku_goods','walkman','ccd','media_record','playback_device','game_console']);
    if (JP_CATS.has(result.category)) {
      const o = (result.origin || '').toString();
      if (!o || o === '不详' || !/日本|日|Japan|jp/i.test(o)) {
        result.origin = '日本';
      }
    }
    result.fromCache = false;
    if (imageHash) result.imageHash = imageHash;
    result.__pipeline = { source: 'lovable_gemini', model: MAIN_MODEL, webSearchUsed: false };

    await adminClient.from('guest_daily_usage').upsert({
      ip_hash: ipHash, usage_date: today,
      recognize_count: used + 1, updated_at: new Date().toISOString(),
    }, { onConflict: 'ip_hash,usage_date' });
    result.remaining = limit - (used + 1);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[GuestRecognize] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '识别失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
