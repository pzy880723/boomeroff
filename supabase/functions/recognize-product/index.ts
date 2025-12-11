import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, style } = await req.json();
    
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

    console.log('Starting product recognition...');

    // 构建系统提示词
    const systemPrompt = `你是一位专业的日本回流杂项鉴定专家，精通瓷器、线香、文房四宝、漆器、铜器、木器、织物、首饰、书画等各类古玩杂项。

请仔细观察图片中的商品，并提供以下信息（用JSON格式返回）：

{
  "name": "商品名称（简洁准确）",
  "category": "分类（porcelain/incense/stationery/lacquerware/bronze/woodcraft/textile/jewelry/painting/other）",
  "era": "年代估计（如：昭和时期、明治时期、江户时期等）",
  "material": "材质（如：陶瓷、黄铜、紫檀木等）",
  "craft": "工艺特点（如：手绘青花、錾刻工艺等）",
  "dimensions": "尺寸估计（根据图片估算）",
  "condition": "品相描述（全品、小磕、有修等）",
  "description": "商品特点描述（50-100字）",
  "scripts": {
    "professional": "简洁专业话术（突出材质、工艺、尺寸，约30-50字）",
    "sales": "销售导向话术（强调价值感、稀缺性、收藏价值，约50-80字）",
    "cultural": "文化知识话术（历史背景、文化内涵、名家典故，约80-120字）"
  },
  "suggestedPriceRange": {
    "min": 最低建议价格（数字）,
    "max": 最高建议价格（数字）,
    "average": 平均建议价格（数字）
  },
  "confidence": 识别置信度（0-1之间的数字）
}

注意：
1. 价格单位为人民币元
2. 话术要适合直播间快节奏使用
3. 如果无法确定某项信息，给出合理推测并在话术中使用模糊表达`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: '请识别这个商品并生成直播话术：' },
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
    
    console.log('AI response received:', content?.substring(0, 200));

    // 解析JSON响应
    let result;
    try {
      // 尝试提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // 返回原始内容让前端处理
      return new Response(
        JSON.stringify({ 
          rawContent: content,
          error: '解析失败，请查看原始识别结果' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Product recognized successfully:', result.name);

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
