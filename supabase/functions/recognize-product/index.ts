import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callLovableAI(imageBase64: string, systemPrompt: string, apiKey: string) {
  const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: '识别这件中古商品，仅返回JSON' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  return response;
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

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
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

    const recognitionPrompt = `识别中古杂货商品（多为日本回流），帮助门店店员快速了解未知商品。仅返回 JSON：
{
  "name": "商品名称（具体到品名）",
  "category": "porcelain/incense/stationery/lacquerware/bronze/woodcraft/textile/jewelry/painting/other",
  "era": "年代（如 昭和中期 1960s）",
  "origin": "产地（如 日本京都 清水烧）",
  "material": "材质",
  "craft": "工艺特点（一句话）",
  "sellingPoints": ["卖点1（短句，最重要）", "卖点2", "卖点3"],
  "description": "100字内详细介绍，店员可直接讲给顾客（包含历史背景、价值点、适用场景）",
  "tips": "店员小贴士一句话（保养/辨真/搭配建议任选一）",
  "imageHash": "商品特征关键词3-5个用空格分隔"
}
卖点必须3-5条，每条短句直击重点。`;

    const response = await callLovableAI(imageBase64, recognitionPrompt, LOVABLE_API_KEY);
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
