// 游客版（免登录）AI 识物
// 与 recognize-product 同样的 AI 调用，但：
// - 不需要 JWT
// - 不写 products 表（不污染知识库）
// - 按 IP 哈希做每日限频（在 app_settings.guest_limits 里配置）
// - 仅做 hash_cache 命中复用 + 主 AI 识别两步，跳过 quickClassify/nameMatch（保持轻量）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const LITE_MODEL = 'google/gemini-2.5-flash-lite';

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
              text: { type: 'string', description: '≤22汉字短句' },
            },
            required: ['tag', 'text'],
          },
        },
        pitch: {
          type: 'object',
          properties: {
            opener: { type: 'string', description: '≤30字开场，含品类+年代/产地' },
            highlight: { type: 'string', description: '≤45字亮点句' },
          },
          required: ['opener', 'highlight'],
        },
        confidence: { type: 'number', description: '置信度 0-1' },
      },
      required: ['name', 'category', 'pitch', 'confidence'],
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

function productRowToResult(row: any) {
  let tipsObj: any = undefined;
  if (typeof row.tips === 'string' && row.tips.trim().startsWith('{')) {
    try { tipsObj = JSON.parse(row.tips); } catch { tipsObj = row.tips; }
  } else if (row.tips) tipsObj = row.tips;
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

    // 限额配置
    const { data: cfgRow } = await adminClient
      .from('app_settings').select('value').eq('key', 'guest_limits').maybeSingle();
    const cfg = (cfgRow?.value || {}) as { enabled?: boolean; recognize_per_day?: number };
    const enabled = cfg.enabled !== false;
    const limit = Math.max(1, Number(cfg.recognize_per_day || 30));
    if (!enabled) {
      return new Response(JSON.stringify({ error: '游客通道已关闭，请稍后再试' }), {
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

    // 单张体积保护：超过 ~1.5MB base64（约 1.1MB 图）拒绝
    const tooBig = imageList.find((s) => s.length > 1_600_000);
    if (tooBig) {
      return new Response(JSON.stringify({ error: '图片过大，请重新拍摄或换张较小的图' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 命中 hash 缓存：直接返回历史商品（公开数据，可复用）
    if (imageHash) {
      const { data: hit } = await adminClient
        .from('products').select('*').eq('image_hash', imageHash)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (hit) {
        // 计入 1 次（仍消耗一次配额，避免无限重试同图刷限额）
        await adminClient.from('guest_daily_usage').upsert({
          ip_hash: ipHash, usage_date: today,
          recognize_count: used + 1, updated_at: new Date().toISOString(),
        }, { onConflict: 'ip_hash,usage_date' });
        const cached = productRowToResult(hit);
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

    // 调 AI
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
      : '请鉴定这件中古商品，调用 submit_recognition 工具提交结果。';
    const userContent: any[] = [{ type: 'text', text: userText }];
    for (const url of imageUrls) userContent.push({ type: 'image_url', image_url: { url } });

    const systemPrompt = `你是日本中古杂货资深鉴定师。看图后调用 submit_recognition 工具提交。
全简体中文，外文品牌音译。看不清写"不详"，宁缺勿编。
sellingPoints 恰好 3 条，tag 必须是 身世/工艺/稀缺/场景。每条 ≤22 字。
pitch.opener ≤30 字，pitch.highlight ≤45 字。`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    let resp: Response;
    try {
      resp = await fetch(LOVABLE_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LITE_MODEL,
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
    result.fromCache = false;
    if (imageHash) result.imageHash = imageHash;
    result.__pipeline = { source: 'lovable_gemini', model: LITE_MODEL, webSearchUsed: false };

    // 计数 +1
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
