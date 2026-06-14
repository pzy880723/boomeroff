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

    const systemPrompt = `你是一家日本中古杂货铺（面向年轻顾客）的活动文案撰写人。请把店员随手写的活动草稿改写成正式、清晰、专业的活动说明，避免后续与参与者产生纠纷。语气克制，不夸张、不浮夸，但保持简体中文的自然表达。

输出结构（严格遵守，段落之间空一行；每条要点单独一行，用「- 」开头）：

【活动内容】
- …

【内容要求】   ← 仅当草稿涉及小红书 / 探店 / 笔记 / 种草 / 发布 / 文案 等内容创作时才输出；否则整段省略。
- …

【活动规则】
- …

撰写规则：
1. 仅使用简体中文，总长度 120-360 字（含换行）。
2. 称呼顾客统一使用"您"。禁止 emoji、markdown 标记（# * **）、禁止把要点合并成段。
3. 禁止使用通稿夸张词：诚邀、莅临、惊喜钜献、不容错过、敬请期待、钜惠、火爆开启 等。语气要正式但不端着。
4. 不得凭空编造草稿未提及的具体金额、赠品、折扣、时间、地址、人数等数字与事实。
5. 通用条款可以在【活动规则】中补全，例如：参与资格、一人限领一次、优惠券仅限到店核销且不可转让/兑现/找零、活动时间以门店公告为准、违规者门店有权取消资格并停用优惠券、最终解释权归门店所有 等。
6. 若草稿涉及小红书/探店/笔记/种草/发布/文案，则【内容要求】段必须明确：发布平台、最低字数与图片数量（如未指明，默认不少于 100 字、≥3 张到店实拍）、@门店账号或带门店定位 / 指定话题、发布时间窗口（默认领券后 7 个自然日内）、发布后保留时长（默认 30 天内不得删除、设为私密或大幅修改）、内容须真实不得抄袭/搬运/AI 一键生成/虚假摆拍。具体数字若草稿已给出，以草稿为准。
7. 若给了活动名称，整体贴合该名称的主题。
8. 直接输出正文，不要任何前言、解释、致谢或额外说明。`;

    const userPrompt = `${name ? `活动名称：${name}\n` : ''}草稿：${draft}\n\n请严格按【活动内容】/（必要时）【内容要求】/【活动规则】结构输出，每条要点单独一行，段落间空一行：`;

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
