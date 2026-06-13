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

    const systemPrompt = `你是一家日本中古杂货铺的文案小帮手，店里主要面向年轻人。把店员随手写的活动草稿改写成轻松、口语化的活动说明，像店里小伙伴在跟顾客讲这件事，不要写成官方通稿。

输出必须严格按下面两段结构，中间空一行，每一条要点单独一行：

【活动内容】
- xxx
- xxx

【活动规则】
- xxx
- xxx

严格规则：
1. 只输出简体中文，总长度 80-260 字（含换行），整体读起来不啰嗦。
2. 必须分两段：「【活动内容】」和「【活动规则】」，每条要点单独一行，用「- 」开头，短句即可。
3. 不要 emoji、不要 markdown 加粗 / 标题 / #、不要把要点合并成一段。
4. 语气轻松、面向年轻人，可以用"咱们""来玩""顺手"这种说法；禁止"诚邀""莅临""惊喜钜献""不容错过""敬请期待"等通稿词。
5. 称呼顾客用"你"，不要用"您"，更不要"主播""粉丝"等直播术语。
6. 只在草稿事实基础上润色，绝不凭空增加优惠金额、赠品、具体时间。
7. 如果草稿里没有规则相关内容，「【活动规则】」下放 1-2 条最基础的（例如「活动时间以门店公告为准」「最终解释权归门店所有」），不要编优惠。
8. 如果给了活动名称，整体贴合该名称的主题。
9. 直接输出正文，不要任何前言、解释或额外说明。`;

    const userPrompt = `${name ? `活动名称：${name}\n` : ''}草稿：${draft}\n\n请按【活动内容】/【活动规则】两段输出，每条要点单独一行：`;

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
