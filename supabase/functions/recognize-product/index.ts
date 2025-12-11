import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: '请提供商品图片' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI服务未配置' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 初始化Supabase客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting quick product recognition...');

    // 第一步：快速生成图像特征用于匹配
    const featurePrompt = `看这张商品图片，用20个字以内描述其核心特征（类型+材质+特点），直接返回特征描述文字，不要JSON。`;
    
    const featureResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: featurePrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: '描述特征：' },
              { 
                type: 'image_url', 
                image_url: { 
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` 
                } 
              }
            ]
          }
        ],
      }),
    });

    if (!featureResponse.ok) {
      throw new Error('特征提取失败');
    }

    const featureData = await featureResponse.json();
    const imageHash = featureData.choices?.[0]?.message?.content?.trim() || '';
    console.log('Image hash:', imageHash);

    // 第二步：查询知识库是否有相似商品（使用关键词ilike匹配）
    if (imageHash) {
      // 提取关键词进行模糊匹配
      const keywords = imageHash.split(/[\s,，、]+/).filter((k: string) => k.length > 1).slice(0, 3);
      console.log('[Match] Searching with keywords:', keywords);

      let existingProducts = null;
      
      if (keywords.length > 0) {
        // 构建OR条件的ilike查询
        const orConditions = keywords.map((k: string) => `image_hash.ilike.%${k}%`).join(',');
        console.log('[Match] Query conditions:', orConditions);
        
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .not('image_hash', 'is', null)
          .or(orConditions)
          .limit(5);
        
        if (error) {
          console.error('[Match] Query error:', error);
        } else {
          existingProducts = data;
          console.log('[Match] Found products:', data?.length || 0);
        }
      }

      // 如果找到相似商品，直接返回
      if (existingProducts && existingProducts.length > 0) {
        const match = existingProducts[0];
        console.log('[Match] Cache hit! Product:', match.name, 'Hash:', match.image_hash);
        
        const scripts = match.scripts as Record<string, string> || {};
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
            suggestedPriceRange: null,
            confidence: 0.9,
            fromCache: true,
            imageHash,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('[Match] No cache match found');
    }

    // 第三步：知识库未命中，进行完整识别（使用最强模型）
    console.log('No cache match, performing full recognition...');
    
    const systemPrompt = `你是日本回流杂项直播助手。快速识别商品，生成10秒内能说完的卖点话术。

要求：
1. 直接简洁，不要深度分析
2. sales话术控制在30-50字，10秒能说完
3. 突出：品类、材质、年代、亮点
4. 立即返回JSON

返回格式（严格JSON）：
{
  "name": "商品名（简洁）",
  "category": "porcelain/incense/stationery/lacquerware/bronze/woodcraft/textile/jewelry/painting/other",
  "era": "年代",
  "material": "材质",
  "craft": "工艺",
  "dimensions": "尺寸估计",
  "condition": "品相",
  "description": "特点描述（30字内）",
  "scripts": {
    "professional": "专业话术（20字）",
    "sales": "卖点话术（30-50字，10秒能说完）",
    "cultural": "文化话术（50字）"
  },
  "suggestedPriceRange": {"min": 数字, "max": 数字, "average": 数字}
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: '识别并生成话术：' },
              { 
                type: 'image_url', 
                image_url: { 
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` 
                } 
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
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
    
    console.log('AI response received');

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
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ 
          rawContent: content,
          error: '解析失败，请查看原始识别结果' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 添加图像特征到结果
    result.imageHash = imageHash;
    result.fromCache = false;

    console.log('Product recognized:', result.name);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in recognize-product:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '识别失败' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
