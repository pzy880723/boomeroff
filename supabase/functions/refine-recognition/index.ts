// 识别纠错对话：用户跟 AI 来回讨论，给出新的识别结果（流式）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const ALLOWED_MODELS = new Set([
  'google/gemini-3-flash-preview',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
]);
// 默认走 gemini-3-flash-preview：多模态强 + 首字 1-2s，纠错对话不必非走 pro
const REFINE_DEFAULT = 'google/gemini-3-flash-preview';

async function resolveModel(adminClient: any) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  let model = REFINE_DEFAULT;
  try {
    const { data } = await adminClient.from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
    const v = data?.value;
    // 管理员显式选了 pro / flash，尊重之；选了 lite 仍保留默认 flash-preview（lite 多模态偏弱）
    if (v && typeof v.model === 'string' && ALLOWED_MODELS.has(v.model) && v.model !== 'google/gemini-2.5-flash-lite') {
      model = v.model;
    }
  } catch (_) { /* ignore */ }
  return { url: LOVABLE_URL, apiKey: lovableKey, model };
}

const SYSTEM_PROMPT = `你是日本中古杂货资深鉴定师，正在跟一位门店店员一对一对话纠正/讨论一件商品的识别结果。

【交流原则】
- 全程使用简体中文，用第二人称"你/您"称呼对方，不要使用"主播"等其它角色称呼。
- 像朋友聊天一样自然回答，先回答店员的问题，再补充观察 / 追问关键线索（底款？尺寸？侧面？包装？）。
- 不确定的字段写"不详"，不要瞎编。

【输出规则】
- 默认就用一段不超过 120 字的纯中文聊天文字回答，不要贴 JSON、不要复述字段名、不要写大括号引号。
- **只有当你确定要更新识别结果时**（例如店员明确告诉你正确答案、你重新观察后改了名称/年代/产地等），才在文字回答后空一行，附一个完整 JSON 代码块（用 \`\`\`json ... \`\`\` 包裹），系统会用它替换识别结果。纯追问 / 纯解释不需要 JSON。
- 需要给 JSON 时，结构如下：
\`\`\`json
{"name":"","category":"jp_porcelain|eu_porcelain|incense|antique_art|local_craft|anime_toy|otaku_goods|luxury|vintage_jewelry|game_console|walkman|ccd|media_record|playback_device|home_appliance|hobby|other","era":"","origin":"","material":"","craft":"","sellingPoints":[{"tag":"身世|工艺|稀缺|场景","text":"≤18字"}],"pitch":{"opener":"≤22字开场句号","highlight":"≤28字亮点句号"},"description":"≤80字长描述","tips":{"memory":"≤20字记忆口诀","objection":"≤30字顾客常问应答"},"confidence":0.0}
\`\`\``;

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
      extraImages = [],
      originalPayload,
    } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      imageBase64?: string;
      imageUrl?: string;
      extraImages?: string[];
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
      { type: 'text', text: `这是上次识别的结果（可能有错）：\n${JSON.stringify(originalPayload || {}, null, 2)}\n\n店员的纠正/提示：${firstHint}\n\n请结合下方图片重新判断。${extraImages.length ? `\n注意：第一张是原图，后 ${extraImages.length} 张是店员补拍的细节图（底款/侧面/包装等），请重点参考。` : ''}` },
    ];
    if (imgPart) firstUserContent.push(imgPart);
    for (const b64 of extraImages) {
      if (!b64) continue;
      const url = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
      firstUserContent.push({ type: 'image_url' as const, image_url: { url } });
    }

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
