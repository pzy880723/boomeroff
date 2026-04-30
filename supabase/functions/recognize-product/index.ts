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

const DEFAULT_LOVABLE_MODEL = 'google/gemini-2.5-flash-lite';
const LOVABLE_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

async function resolveModelConfig(adminClient: any): Promise<ModelConfig> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  const fallback: ModelConfig = {
    url: LOVABLE_URL, apiKey: lovableKey,
    model: DEFAULT_LOVABLE_MODEL, jsonMode: true,
  };

  try {
    const { data } = await adminClient
      .from('app_settings').select('value').eq('key', 'ai_model').maybeSingle();
    const v = data?.value;
    if (!v) return fallback;
    if (v.provider === 'custom' && v.custom?.baseUrl && v.custom?.apiKey && v.custom?.model) {
      return {
        url: `${String(v.custom.baseUrl).replace(/\/+$/, '')}/chat/completions`,
        apiKey: v.custom.apiKey,
        model: v.custom.model,
        // 自定义接口不强制 JSON 模式（兼容性更好）
        jsonMode: false,
      };
    }
    return {
      url: LOVABLE_URL,
      apiKey: lovableKey,
      model: v.model || DEFAULT_LOVABLE_MODEL,
      jsonMode: true,
    };
  } catch (e) {
    console.warn('[Recognition] settings load failed, fallback:', e);
    return fallback;
  }
}

async function callAI(images: string[], systemPrompt: string, cfg: ModelConfig) {
  const imageUrls = images.map((img) =>
    img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
  );

  const userText = imageUrls.length > 1
    ? `以下为同一件中古商品的 ${imageUrls.length} 个角度照片，请综合所有角度判断，仅返回JSON`
    : '识别这件中古商品，仅返回JSON';

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI 服务未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    const recognitionPrompt = `你是中古杂货识别助手。仅返回JSON，简洁不啰嗦：
{"name":"","category":"porcelain|incense|stationery|lacquerware|bronze|woodcraft|textile|jewelry|painting|other","era":"","origin":"","material":"","craft":"","sellingPoints":["","",""],"description":"≤80字介绍","tips":"一句话贴士","imageHash":"3-5关键词空格分隔"}
sellingPoints要3条短句直击重点。`;

    const response = await callLovableAI(imageList, recognitionPrompt, LOVABLE_API_KEY);
    const aiTime = Date.now() - startTime;

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
    console.log('[Recognition] AI time:', aiTime, 'ms');

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

    // 知识库缓存匹配
    const imageHash = result.imageHash || '';
    if (imageHash) {
      const keywords = imageHash.split(/[\s,，、]+/).filter((k: string) => k.length > 1).slice(0, 3);
      if (keywords.length > 0) {
        const orConditions = keywords.map((k: string) => `image_hash.ilike.%${k}%`).join(',');
        const { data: existing } = await adminClient
          .from('products')
          .select('*')
          .not('image_hash', 'is', null)
          .or(orConditions)
          .limit(1);

        if (existing && existing.length > 0) {
          const match = existing[0];
          const totalTime = Date.now() - startTime;
          console.log('[Recognition] Cache hit:', match.name, 'Total:', totalTime, 'ms');
          return new Response(JSON.stringify({
            name: match.name,
            category: match.category,
            era: match.era,
            origin: match.origin,
            material: match.material,
            craft: match.craft,
            dimensions: match.dimensions,
            condition: match.condition,
            description: match.description,
            sellingPoints: Array.isArray(match.selling_points) ? match.selling_points : [],
            tips: match.tips,
            confidence: 0.9,
            fromCache: true,
            imageHash,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    result.fromCache = false;
    const totalTime = Date.now() - startTime;
    console.log('[Recognition]', result.name, 'Total:', totalTime, 'ms');

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
