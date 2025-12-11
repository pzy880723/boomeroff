import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 豆包 API 调用函数
async function callDoubao(imageBase64: string, prompt: string, apiKey: string) {
  console.log('[Doubao] Calling Doubao API...');
  
  // 确保图片格式正确 - 豆包需要 data URL 格式
  const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'doubao-seed-1-6-vision-250815',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageUrl }
          ]
        }
      ]
    }),
  });

  return response;
}

// Lovable AI 调用函数
async function callLovableAI(imageBase64: string, systemPrompt: string, apiKey: string) {
  console.log('[LovableAI] Calling Lovable AI...');
  
  const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
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

// 解析豆包响应 - doubao-seed 推理模型返回 output 数组
function parseDoubaoResponse(data: any): string | null {
  try {
    // doubao-seed 模型响应格式: output 是数组，包含 reasoning 和 message 类型
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        // 查找 message 类型的输出（包含实际结果）
        if (item.type === 'message' && item.content) {
          // content 可能是数组
          if (Array.isArray(item.content)) {
            const textItem = item.content.find((c: any) => c.type === 'output_text');
            if (textItem?.text) {
              console.log('[Doubao] Found output_text in message');
              return textItem.text;
            }
          }
          // content 可能是字符串
          if (typeof item.content === 'string') {
            return item.content;
          }
        }
      }
      // 如果没有 message，输出完整结构用于调试
      console.log('[Doubao] Output types:', data.output.map((o: any) => o.type).join(', '));
    }
    
    // 兼容其他可能的响应格式
    if (data.output?.choices?.[0]?.message?.content) {
      return data.output.choices[0].message.content;
    }
    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    if (typeof data.output === 'string') {
      return data.output;
    }
    
    console.log('[Doubao] Unknown response format:', JSON.stringify(data).slice(0, 500));
    return null;
  } catch (e) {
    console.error('[Doubao] Parse error:', e);
    return null;
  }
}

// 解析 Lovable AI 响应
function parseLovableResponse(data: any): string | null {
  return data.choices?.[0]?.message?.content || null;
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

    const DOUBAO_API_KEY = Deno.env.get('DOUBAO_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!DOUBAO_API_KEY && !LOVABLE_API_KEY) {
      console.error('No AI API keys configured');
      return new Response(
        JSON.stringify({ error: 'AI服务未配置' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Recognition] Starting for user:', user.id);
    const startTime = Date.now();

    // 识别提示词
    const recognitionPrompt = `日本杂货识别。30字内返回JSON，不要思考。

格式：
{"name":"名称","category":"porcelain/incense/stationery/lacquerware/bronze/woodcraft/textile/jewelry/painting/other","era":"年代","material":"材质","craft":"工艺","dimensions":"尺寸","condition":"品相","description":"特点20字","scripts":{"professional":"专业10字","sales":"卖点30字","cultural":"文化30字"},"suggestedPriceRange":{"min":0,"max":0,"average":0},"imageHash":"类型+材质+特点10字"}`;

    let content: string | null = null;
    let aiProvider = 'unknown';

    // 优先使用豆包（国内延迟更低）
    if (DOUBAO_API_KEY) {
      try {
        const doubaoStart = Date.now();
        const response = await callDoubao(imageBase64, recognitionPrompt, DOUBAO_API_KEY);
        const doubaoTime = Date.now() - doubaoStart;
        
        if (response.ok) {
          const data = await response.json();
          console.log('[Doubao] Response time:', doubaoTime, 'ms');
          console.log('[Doubao] Raw response:', JSON.stringify(data).slice(0, 500));
          
          content = parseDoubaoResponse(data);
          if (content) {
            aiProvider = 'doubao';
            console.log('[Doubao] Successfully parsed response');
          } else {
            console.warn('[Doubao] Failed to parse response, will fallback');
          }
        } else {
          const errorText = await response.text();
          console.warn('[Doubao] API error:', response.status, errorText.slice(0, 200));
        }
      } catch (doubaoError) {
        console.warn('[Doubao] Request failed, falling back to Lovable AI:', doubaoError);
      }
    }

    // 降级到 Lovable AI
    if (!content && LOVABLE_API_KEY) {
      try {
        const lovableStart = Date.now();
        const response = await callLovableAI(imageBase64, recognitionPrompt, LOVABLE_API_KEY);
        const lovableTime = Date.now() - lovableStart;
        
        if (response.ok) {
          const data = await response.json();
          console.log('[LovableAI] Response time:', lovableTime, 'ms');
          
          content = parseLovableResponse(data);
          if (content) {
            aiProvider = 'lovable';
            console.log('[LovableAI] Successfully parsed response');
          }
        } else {
          const errorText = await response.text();
          console.error('[LovableAI] AI gateway error:', response.status, errorText);
          
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
        }
      } catch (lovableError) {
        console.error('[LovableAI] Request failed:', lovableError);
      }
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'AI识别失败，请重试' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiTime = Date.now() - startTime;
    console.log(`[Recognition] AI (${aiProvider}) response time:`, aiTime, 'ms');

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
              aiProvider,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    result.fromCache = false;
    result.aiProvider = aiProvider;
    const totalTime = Date.now() - startTime;
    console.log(`[Recognition] Product recognized via ${aiProvider}:`, result.name, 'Total time:', totalTime, 'ms');

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
