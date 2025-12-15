import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lovable AI 调用函数 (使用 Gemini 2.5 Flash Lite 提升速度)
async function callLovableAI(imageBase64: string, systemPrompt: string, apiKey: string) {
  console.log('[LovableAI] Calling Gemini 2.5 Flash Lite...');
  
  const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: '识别：' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
    }),
  });

  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 验证用户身份和角色
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[Auth] No authorization header');
      return new Response(
        JSON.stringify({ error: '请先登录' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // 使用用户的 JWT 创建客户端来验证身份
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // 获取当前用户
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('[Auth] Invalid user:', userError);
      return new Response(
        JSON.stringify({ error: '登录已过期，请重新登录' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Auth] User authenticated:', user.id);

    // 使用 service role 检查用户角色
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      console.error('[Auth] Failed to get user role:', roleError);
      return new Response(
        JSON.stringify({ error: '无法获取用户权限' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userRole = roleData.role;
    if (userRole !== 'admin' && userRole !== 'anchor') {
      console.error('[Auth] Insufficient permissions, role:', userRole);
      return new Response(
        JSON.stringify({ error: '没有识别商品的权限，需要管理员或主播角色' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Auth] User role verified:', userRole);

    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: '请提供商品图片' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      console.error('[Recognition] LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI服务未配置' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Recognition] Starting for user:', user.id);
    const startTime = Date.now();

    // 精简提示词 - 优化速度
    const recognitionPrompt = `日本杂货鉴定。返回JSON：
{"name":"名称","category":"porcelain/incense/stationery/lacquerware/bronze/woodcraft/textile/jewelry/painting/other","subCategory":"细分(九谷烧/萩烧/备前烧/有田烧/轮岛涂/南部铁器等)","vesselType":"器型(盖碗/急须/抹茶碗/香炉等)","era":"年代","material":"材质","craft":"工艺","description":"20字概述","enrichedContent":{"basicIntro":"50字材质工艺介绍","culturalBackground":"60字历史文化背景","usageScenario":"30字使用建议"},"scripts":{"professional":"40字专业话术","sales":"60字销售话术","cultural":"60字文化话术"},"suggestedPriceRange":{"min":0,"max":0,"average":0},"imageHash":"3字特征"}
直接返回JSON。`;

    // 调用 Lovable AI (Gemini 2.5 Flash)
    const response = await callLovableAI(imageBase64, recognitionPrompt, LOVABLE_API_KEY);
    const aiTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LovableAI] Error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: '请求过于频繁，请稍后再试' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI额度不足，请充值' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI识别失败，请重试' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log('[LovableAI] Response time:', aiTime, 'ms');

    if (!content) {
      console.error('[LovableAI] Empty response');
      return new Response(
        JSON.stringify({ error: 'AI返回空响应，请重试' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 解析JSON响应
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[Recognition] Failed to parse AI response:', parseError, 'Content:', content);
      return new Response(
        JSON.stringify({ 
          rawContent: content,
          error: '解析失败，请查看原始识别结果' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 检查知识库是否有相似商品
    const imageHash = result.imageHash || '';
    if (imageHash) {
      const keywords = imageHash.split(/[\s,，、]+/).filter((k: string) => k.length > 1).slice(0, 3);
      
      if (keywords.length > 0) {
        const orConditions = keywords.map((k: string) => `image_hash.ilike.%${k}%`).join(',');
        
        const { data: existingProducts } = await adminClient
          .from('products')
          .select('*')
          .not('image_hash', 'is', null)
          .or(orConditions)
          .limit(1);
        
        if (existingProducts && existingProducts.length > 0) {
          const match = existingProducts[0];
          console.log('[Match] Cache hit! Product:', match.name);
          
          const scripts = match.scripts as Record<string, string> || {};
          const totalTime = Date.now() - startTime;
          console.log('[Recognition] Total time (cache hit):', totalTime, 'ms');
          
          return new Response(
            JSON.stringify({
              name: match.name,
              category: match.category,
              era: match.era,
              material: match.material,
              craft: match.craft,
              dimensions: match.dimensions,
              condition: match.condition,
              description: match.description,
              scripts: {
                professional: scripts.professional || '',
                sales: scripts.sales || '',
                cultural: scripts.cultural || '',
              },
              suggestedPriceRange: result.suggestedPriceRange || null,
              confidence: 0.9,
              fromCache: true,
              imageHash,
              aiProvider: 'lovable',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    result.fromCache = false;
    result.aiProvider = 'lovable';
    const totalTime = Date.now() - startTime;
    console.log('[Recognition] Product recognized:', result.name, 'Total time:', totalTime, 'ms');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Recognition] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '识别失败' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
