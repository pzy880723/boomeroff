// 公共：根据识别结果生成「种草/装逼/藏家」三种风格的图文文案
// - 无需 JWT
// - 复用 guest_daily_usage 简单按 IP 限频（与 share 共额度，避免新增列）
// - 调 Lovable AI Gateway，结构化输出 { caption }
// - 服务端清洗：去掉「主播」「直播间」等禁用词
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Style = 'xhs' | 'pyq' | 'collector';

const STYLE_BRIEF: Record<Style, string> = {
  xhs: `小红书姐妹种草体：开头一句惊呼/感叹，使用 1-3 个 emoji，多用「！」「绝了」「上头」「剁手」「姐妹们」「冲」等口语，分 3-4 个短段，结尾必须有"剁手 / 拦不住我 / 已经背回家"等强冲动收尾。`,
  pyq: `朋友圈装逼随手记：克制、有质感、几乎不用 emoji，1-3 段短文，像随手拍照配文。强调"偶遇 / 眼缘 / 顺手带回家"，不喧哗。`,
  collector: `中古藏家口吻：半专业，先点出物件名/品牌/年代/工艺，再讲为什么动心，最后落到"缘分"或"老物件值得慢慢养"。语气稳，少 emoji。`,
};

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

function sanitize(s: string): string {
  return (s || '')
    .replace(/主播/g, '店员')
    .replace(/直播间/g, '店里')
    .trim();
}

function normalizePoints(sp: unknown): string[] {
  if (!Array.isArray(sp)) return [];
  return sp
    .map((p: any) => (typeof p === 'string' ? p : p?.text || ''))
    .map((t: string) => (t || '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

interface Body {
  name?: string;
  category?: string;
  era?: string | null;
  origin?: string | null;
  material?: string | null;
  craft?: string | null;
  brand?: string | null;
  story?: string | null;
  sellingPoints?: unknown;
  style?: Style;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json()) as Body;
    const name = (body.name || '').toString().trim();
    if (!name) {
      return new Response(JSON.stringify({ error: '缺少商品名' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const style: Style = body.style === 'pyq' || body.style === 'collector' ? body.style : 'xhs';

    // —— 限频：每 IP 每天最多 30 次生成（独立计数桶 copy_count_YYYYMMDD 行内 ip_hash 复用）——
    const ip = getClientIp(req);
    const salt = Deno.env.get('GUEST_IP_SALT') || 'boomeroff-guest-salt';
    const ipHash = await sha256Hex(`${salt}:${ip}`);
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
      .toISOString().slice(0, 10);
    const { data: usageRow } = await adminClient
      .from('guest_daily_usage')
      .select('share_count, recognize_count')
      .eq('ip_hash', ipHash).eq('usage_date', today).maybeSingle();
    // 这里复用 share_count 作为软限频指标 + 30 次硬上限
    const used = (usageRow?.share_count || 0);
    if (used >= 60) {
      return new Response(JSON.stringify({ error: '今日生成次数已达上限，请明天再试' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI 暂不可用' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const points = normalizePoints(body.sellingPoints);
    const facts = {
      品名: name,
      品牌: (body.brand || '').toString().trim() || null,
      年代: (body.era || '').toString().trim() || null,
      产地: (body.origin || '').toString().trim() || null,
      材质: (body.material || '').toString().trim() || null,
      工艺: (body.craft || '').toString().trim() || null,
      看点: points.length ? points : null,
      故事背景: (body.story || '').toString().trim().slice(0, 400) || null,
    };

    const sys = `你是「BOOMER-OFF 中古杂货」的文案助理。
任务：为顾客刚识别到的一件中古物件，写一段可以直接发到社交媒体的短文案，
让朋友看到也想买。文案站在顾客本人的口吻（"我偶遇 / 我入了"），不要写成商品介绍。

风格：${STYLE_BRIEF[style]}

铁律（违反任意一条都要重写）：
1. 总长度 150-220 个汉字（含标点，不含末尾免责小字）。
2. 100% 简体中文；品牌/型号原文（英文/日文）允许出现，但描述句子必须中文。
3. 只能使用我提供的事实字段，禁止编造价格、产地、品牌、材质、年代、稀有度。
4. 严禁出现「主播」「直播间」「秒杀」「保真」「真品」「保证升值」等词。
5. 末尾另起一行写："— AI 生成仅供欣赏 · via BOOMER-OFF —"。
6. 输出 caption 一个字段，字符串内可以含换行 \\n。`;

    const userPrompt = `这件物件的事实如下（null 表示没有，请不要编造）：
${JSON.stringify(facts, null, 2)}

请按上面的风格写一段 caption 出来。`;

    // —— 调 Lovable AI Gateway（纯文本，避免不同模型对 json_schema 支持差异）—— //
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': apiKey,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userPrompt + '\n\n直接输出 caption 正文，不要包裹 JSON、不要前后多余说明。' },
        ],
        temperature: 0.95,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => '');
      console.error('[ShareCopy] AI error:', aiResp.status, errText);
      return new Response(JSON.stringify({
        error: aiResp.status === 429 ? 'AI 限流，请稍后重试'
              : aiResp.status === 402 ? 'AI 额度不足' : 'AI 生成失败',
      }), { status: aiResp.status === 402 ? 402 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const aiData = await aiResp.json();
    let caption: string = (aiData?.choices?.[0]?.message?.content || '').toString();
    // 万一模型仍包成 ```json {...} ``` 或 {"caption": ...}
    caption = caption.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    if (caption.startsWith('{')) {
      try {
        const parsed = JSON.parse(caption);
        if (parsed && typeof parsed.caption === 'string') caption = parsed.caption;
      } catch { /* keep as-is */ }
    }
    caption = sanitize(caption);
    if (!caption) {
      return new Response(JSON.stringify({ error: 'AI 未返回内容' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 累计计数（不阻断主流程）
    await adminClient.from('guest_daily_usage').upsert({
      ip_hash: ipHash, usage_date: today,
      share_count: used + 1,
      recognize_count: usageRow?.recognize_count || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ip_hash,usage_date' });

    return new Response(JSON.stringify({ caption, style }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[ShareCopy] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '生成失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
