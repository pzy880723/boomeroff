// 官方知识详情页 AI 聊天助手
// 入参：{ knowledgeId, messages: [{role,content}] }
// 出参：SSE 流式（直通 Lovable AI Gateway）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ── 鉴权 ─────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 入参 ─────────────────────────────
    const body = await req.json().catch(() => ({}));
    const knowledgeId: string | undefined = body?.knowledgeId;
    const messages: Array<{ role: string; content: string }> = Array.isArray(body?.messages)
      ? body.messages
      : [];
    if (!knowledgeId || messages.length === 0) {
      return new Response(JSON.stringify({ error: '参数缺失' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 读取知识条目 ─────────────────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: item, error: kErr } = await admin
      .from('official_knowledge')
      .select('name,category,ip_name,era,origin,summary,selling_points,tips,body,content')
      .eq('id', knowledgeId)
      .maybeSingle();
    if (kErr || !item) {
      return new Response(JSON.stringify({ error: '词条不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 拼装资料 ─────────────────────────
    const c: any = item.content || {};
    const blocks: string[] = [];
    blocks.push(`【词条名】${item.name}`);
    if (item.ip_name) blocks.push(`【IP/系列】${item.ip_name}`);
    blocks.push(`【分类】${item.category}`);
    if (item.era) blocks.push(`【年代】${item.era}`);
    if (item.origin) blocks.push(`【产地】${item.origin}`);
    if (item.summary) blocks.push(`【简介】${item.summary}`);
    if (c.one_liner) blocks.push(`【一句话讲给客人】${c.one_liner}`);
    if (Array.isArray(c.quick_facts) && c.quick_facts.length) {
      blocks.push(
        `【速记卡】\n` +
          c.quick_facts.map((f: any) => `- ${f.label}：${f.value}`).join('\n'),
      );
    }
    if (Array.isArray(c.customer_pitches) && c.customer_pitches.length) {
      blocks.push(
        `【客户话术】\n` +
          c.customer_pitches.map((p: any) => `- [${p.scene}] ${p.line}`).join('\n'),
      );
    }
    const sp = Array.isArray(item.selling_points) ? item.selling_points : [];
    if (sp.length) {
      blocks.push(
        `【核心卖点】\n` +
          sp
            .map((p: any) => {
              if (typeof p === 'string') return `- ${p}`;
              const tag = p.tag ? `[${p.tag}] ` : '';
              const detail = p.detail ? `（${p.detail}）` : '';
              return `- ${tag}${p.text || ''}${detail}`;
            })
            .join('\n'),
      );
    }
    if (Array.isArray(c.comparisons) && c.comparisons.length) {
      blocks.push(
        `【易混对比】\n` +
          c.comparisons.map((x: any) => `- vs ${x.name}：${x.diff}`).join('\n'),
      );
    }
    if (item.tips) blocks.push(`【店员小贴士】${typeof item.tips === 'string' ? item.tips : JSON.stringify(item.tips)}`);
    if (item.body) blocks.push(`【深度阅读】\n${String(item.body).slice(0, 4000)}`);

    const knowledgeContext = blocks.join('\n\n');

    const systemPrompt = `你是日本中古杂货店的资深买手助理，正在帮**店员**深入理解下面这条官方知识。
请严格基于资料回答；超出资料的内容必须明确说明「资料里没写，仅供参考」。
全程使用简体中文，**禁止使用「主播」一词**，统一称呼对方为「您」或「店员」。
回答控制在 100-300 字，多用要点 / 短句；如果店员问「怎么讲给客人」就直接给一句可念出来的话术。

================ 知识资料 ================
${knowledgeContext}
================ 资料结束 ================`;

    // ── 调用 Lovable AI Gateway（流式）─────────
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY 未配置');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: String(m.content || '') })),
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 额度不足' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await aiResp.text();
      console.error('[chat-knowledge] gateway error', aiResp.status, t);
      return new Response(JSON.stringify({ error: 'AI 服务异常' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('[chat-knowledge] error', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : '未知错误' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
