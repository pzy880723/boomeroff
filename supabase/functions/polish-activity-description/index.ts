// AI 润色活动描述：把店员随手写的草稿改写成正式、吸引人的活动描述
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 验证登录
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: '登录已过期，请重新登录' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const name: string = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : '';
    const draft: string = typeof body.draft === 'string' ? body.draft.trim() : '';
    if (!draft || draft.length < 2) {
      return new Response(JSON.stringify({ error: '请先随便写几句草稿' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (draft.length > 300) {
      return new Response(JSON.stringify({ error: '草稿不要超过 300 字' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI 服务未配置' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `你是一名日本中古杂货门店的文案助理。把店员随手写的活动描述草稿改写成一段正式、友好、吸引顾客参与的活动描述。

严格规则：
1. 只输出简体中文正文一段，80-200 字之间。
2. 不要标题、不要 emoji、不要 markdown、不要分点。
3. 只在草稿事实基础上润色，不要凭空增加优惠金额、赠品、规则、时间。
4. 称呼顾客用"您"或"大家"，不要使用"主播""粉丝"等直播术语。
5. 如果有活动名称，主题贴合该名称。
6. 输出活动描述本身，不要任何前言或解释。`;

    const userPrompt = `${name ? `活动名称：${name}\n` : ''}草稿：${draft}\n\n请输出润色后的活动描述：`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: 'AI 调用过于频繁，请稍后再试' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: 'AI 额度已用尽，请联系管理员充值' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      return new Response(JSON.stringify({ error: `AI 调用失败: ${txt.slice(0, 200)}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiResp.json();
    const polished: string = aiJson?.choices?.[0]?.message?.content?.trim() || '';
    if (!polished) {
      return new Response(JSON.stringify({ error: 'AI 没有返回内容，请稍后再试' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ polished }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || '未知错误' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
