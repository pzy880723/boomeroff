// 识别纠错对话：用户跟 AI 来回讨论，给出新的识别结果（流式）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Precision = 'economy' | 'standard' | 'high';
const PRECISION_MODEL: Record<Precision, string> = {
  economy: 'google/gemini-2.5-flash-lite',
  standard: 'google/gemini-2.5-flash',
  high: 'google/gemini-2.5-pro',
};
const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

async function resolveModel(adminClient: any) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  let precision: Precision = 'high'; // 纠错对话默认走 high，准为先
  let custom: any = null;
  let provider: 'lovable' | 'custom' = 'lovable';
  try {
    const { data } = await adminClient.from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
    const v = data?.value;
    if (v) {
      provider = v.provider === 'custom' ? 'custom' : 'lovable';
      custom = v.custom || null;
    }
  } catch (_) { /* ignore */ }

  if (provider === 'custom' && custom?.baseUrl && custom?.apiKey && custom?.model) {
    return {
      url: `${String(custom.baseUrl).replace(/\/+$/, '')}/chat/completions`,
      apiKey: custom.apiKey,
      model: custom.model,
    };
  }
  return { url: LOVABLE_URL, apiKey: lovableKey, model: PRECISION_MODEL[precision] };
}

const SYSTEM_PROMPT = `你是日本中古杂货资深鉴定师，正在跟一位门店店员一对一对话纠正一件商品的识别结果。

【交流原则】
- 全程使用简体中文，用第二人称"你"称呼对方，不要使用"主播"等其它角色称呼。
- 对方会告诉你之前 AI 识别错在哪里、正确答案大概是什么。
- 你需要结合对方的提示 + 原图重新观察，给出更准确的判断。
- 如果信息还不够，主动追问 1-2 个关键线索（底款？尺寸？侧面？包装？）。
- 不确定的字段写"不详"，不要瞎编。

【输出格式·每次回复必须严格按以下两段，顺序不可颠倒】
第一段：一段不超过 80 字的纯中文说明（你做了什么修正、为什么改、还需要什么信息）。
  - 这段是给店员看的，必须像聊天，不要复述 JSON 字段名（不要写 "name:"、"era:"、大括号、引号等）。
  - 不要在这段里贴任何 JSON 或代码。

第二段：空一行后，紧接一个完整 JSON 代码块（必须用 Markdown \`\`\`json ... \`\`\` 包裹），仅供系统解析，用户看不到。结构如下：
\`\`\`json
{"name":"","category":"jp_porcelain|eu_porcelain|incense|antique_art|local_craft|anime_toy|otaku_goods|luxury|vintage_jewelry|game_console|walkman|ccd|media_record|playback_device|home_appliance|hobby|other","era":"","origin":"","material":"","craft":"","sellingPoints":[{"tag":"身世|工艺|稀缺|场景","text":"≤18字"}],"pitch":{"opener":"≤22字开场句号","highlight":"≤28字亮点句号"},"description":"≤80字长描述","tips":{"memory":"≤20字记忆口诀","objection":"≤30字顾客常问应答"},"confidence":0.0}
\`\`\`

即使本轮主要是追问，也要给出当前最佳猜测的 JSON。`;

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
    const { data: roleData } = await adminClient
      .from('user_roles').select('role').eq('user_id', user.id).single();
    if (!roleData || (roleData.role !== 'admin' && roleData.role !== 'anchor')) {
      return new Response(JSON.stringify({ error: '没有权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      messages = [],
      imageBase64,
      imageUrl,
      originalPayload,
    } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      imageBase64?: string;
      imageUrl?: string;
      originalPayload?: any;
    };

    const cfg = await resolveModel(adminClient);
    if (!cfg.apiKey) {
      return new Response(JSON.stringify({ error: 'AI 未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 首条 user 消息：注入原图 + 原识别结果 + 店员提示
    const firstHint = messages.find((m) => m.role === 'user')?.content || '请帮我重新识别';
    const restMessages = messages.slice(1);

    const imgPart = imageBase64
      ? { type: 'image_url' as const, image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
      : imageUrl
      ? { type: 'image_url' as const, image_url: { url: imageUrl } }
      : null;

    const firstUserContent: any[] = [
      { type: 'text', text: `这是上次识别的结果（可能有错）：\n${JSON.stringify(originalPayload || {}, null, 2)}\n\n店员的纠正/提示：${firstHint}\n\n请结合原图重新判断。` },
    ];
    if (imgPart) firstUserContent.push(imgPart);

    const aiMessages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: firstUserContent },
      ...restMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const aiResp = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 额度不足' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await aiResp.text();
      console.error('[Refine] AI error:', aiResp.status, t);
      return new Response(JSON.stringify({ error: 'AI 调用失败' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('[Refine] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
