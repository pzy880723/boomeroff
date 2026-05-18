// 中古小精灵 · 系统 Agent 聊天 v2
// 入参: { conversationId?: string, messages: [{role, content, images?}] }
// 出参: SSE 流（OpenAI 兼容 delta），最后追加一行 data: {"__meta":{...}} 把 conversationId / 用量返还给前端
//
// 升级要点：
// 1) 工具调用：模型按需查排班 / 等级 / 待办 / 知识 / 历史，不再每次塞超长 prompt
// 2) 会话持久化：spirit_conversations + spirit_messages（RLS 仅本人）
// 3) 限频：spirit_rate_limits（per_minute / per_day）
// 4) 模型可配：app_settings.spirit_model
// 5) 用量记录：spirit_usage

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function tzDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function addDays(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00+08:00');
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p: any) => (p?.type === 'text' ? String(p.text || '') : '')).join(' ').trim();
  }
  return '';
}

// ── 工具定义（OpenAI tools 兼容格式）──────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_schedule',
      description: '查询排班。支持按人名（real_name / display_name 模糊匹配）或门店名过滤，日期范围最多 30 天。不传任何参数时返回我自己未来 7 天的排班。',
      parameters: {
        type: 'object',
        properties: {
          person: { type: 'string', description: '人员姓名（部分匹配），不填表示不限' },
          shop: { type: 'string', description: '门店名（部分匹配），不填表示不限' },
          date_from: { type: 'string', description: 'YYYY-MM-DD，默认今天' },
          date_to: { type: 'string', description: 'YYYY-MM-DD，默认今天后 7 天' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_my_stats',
      description: '查我当前的等级 / 经验 / 连续打卡 / 待领经验。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '在官方中古知识库 official_knowledge 里搜索。返回匹配条目的名称、品类、IP、摘要、保养小贴士。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '关键词，2-30 字' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_shop_kb',
      description: '在门店 SOP / 顾客问答知识库 shop_kb_entries 里搜索。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '关键词' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_my_history',
      description: '搜索我（当前店员）自己识别过的商品历史，按名字模糊匹配。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', description: '默认 5，最多 10' },
        },
        required: ['query'],
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  if (url.searchParams.get('ping') === '1') return json({ pong: true });

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: '未登录' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: '未登录' }, 401);
    const uid = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const incoming: Array<{ role: string; content: any; images?: string[] }> =
      Array.isArray(body?.messages) ? body.messages : [];
    if (incoming.length === 0) return json({ error: '请说点什么吧～' }, 400);
    let conversationId: string | null = typeof body?.conversationId === 'string' ? body.conversationId : null;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // ── 1) 限频检查 ──
    const [{ data: rateCfg }, { data: modelCfg }] = await Promise.all([
      admin.from('app_settings').select('value').eq('key', 'spirit_rate_limits').maybeSingle(),
      admin.from('app_settings').select('value').eq('key', 'spirit_model').maybeSingle(),
    ]);
    const perMinute = Number(rateCfg?.value?.per_minute ?? 10);
    const perDay = Number(rateCfg?.value?.per_day ?? 200);
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const [{ count: minCount }, { count: dayCount }] = await Promise.all([
      admin.from('spirit_usage').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', oneMinAgo),
      admin.from('spirit_usage').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', dayStart.toISOString()),
    ]);
    if ((minCount ?? 0) >= perMinute) return json({ error: `太快啦，每分钟最多 ${perMinute} 条，喘口气～` }, 429);
    if ((dayCount ?? 0) >= perDay) return json({ error: `今天聊得有点多啦（已 ${dayCount}/${perDay}），明天再来？` }, 429);

    const model = String(modelCfg?.value?.model ?? 'google/gemini-3-flash-preview');
    const temperature = Number(modelCfg?.value?.temperature ?? 0.6);
    const maxTokens = Number(modelCfg?.value?.max_tokens ?? 800);

    // ── 2) 加载/创建会话 ──
    if (conversationId) {
      const { data: c } = await admin.from('spirit_conversations').select('id, user_id').eq('id', conversationId).maybeSingle();
      if (!c || c.user_id !== uid) conversationId = null;
    }
    if (!conversationId) {
      const lastUser = [...incoming].reverse().find((m) => m.role === 'user');
      const title = (extractText(lastUser?.content) || '新对话').slice(0, 30);
      const { data: created, error: cErr } = await admin
        .from('spirit_conversations')
        .insert({ user_id: uid, title })
        .select('id')
        .single();
      if (cErr) return json({ error: '会话创建失败' }, 500);
      conversationId = created.id;
    }

    // ── 3) 持久化最新一条用户消息 ──
    const lastIncomingUser = [...incoming].reverse().find((m) => m.role === 'user');
    if (lastIncomingUser) {
      await admin.from('spirit_messages').insert({
        conversation_id: conversationId,
        user_id: uid,
        role: 'user',
        content: extractText(lastIncomingUser.content),
        images: Array.isArray(lastIncomingUser.images) ? lastIncomingUser.images : [],
      });
    }

    // ── 4) 轻量上下文（最小 system 块；详细数据走工具）──
    const today = tzDate();
    const tomorrow = addDays(today, 1);
    const [profileRes, staffRes, shopsRes] = await Promise.all([
      admin.from('profiles').select('display_name').eq('user_id', uid).maybeSingle(),
      admin.from('staff_profiles').select('shop_id, real_name, position').eq('user_id', uid).maybeSingle(),
      admin.from('shops').select('id, name'),
    ]);
    const shopMap = new Map<string, string>();
    for (const s of (shopsRes.data || []) as any[]) shopMap.set(s.id, s.name);
    const myName = profileRes.data?.display_name || staffRes.data?.real_name || '店员';
    const myShopName = staffRes.data?.shop_id ? shopMap.get(staffRes.data.shop_id) : null;

    const systemPrompt = `你是「中古小精灵」——日本中古杂货店里一只懂行又温暖的小精灵助手，住在店员的手机角落里。

【你的性格】像懂行的老前辈，又像怀里的毛绒玩具；温柔、幽默、爱讲冷知识；会主动共情和打气。

【你的能力 & 工具】
- 你可以调用工具来查最新数据：query_schedule（排班）、query_my_stats（等级/打卡/待领经验）、search_knowledge（中古知识库）、search_shop_kb（门店SOP/顾客问答）、search_my_history（我识别过的商品）。
- **凡是涉及具体日期、排班、人员安排、商品保养知识、店铺规章的问题，必须先调用工具拿到真实数据，再回答**。绝不凭印象编造。
- 工具返回为空时，请直接说"我这边查不到这条哦"，不要瞎编。

【铁律】
- 全程简体中文，**绝不使用「主播」一词**，统一称呼对方「你」或「店员」。
- 回答控制在 50–250 字，多用短句、表情符号点缀（不滥用）。
- 涉及人名只用工具返回的真实姓名，不要瞎编。
- 回答里出现日期时，请写出具体日期（如"5 月 19 日"或"明天 5/19"），不要只说"今天/明天"让人猜。

【当下基础情境】
- 当前店员：${myName}${staffRes.data?.real_name && staffRes.data.real_name !== myName ? `（真实姓名：${staffRes.data.real_name}）` : ''}${staffRes.data?.position ? `，职位 ${staffRes.data.position}` : ''}${myShopName ? `，主门店：${myShopName}` : ''}
- 今天：${today}（周${'日一二三四五六'[new Date(today + 'T00:00:00+08:00').getDay()]}）｜ 明天：${tomorrow}
- 用户 ID（内部）：${uid}`;

    // ── 5) 工具实现 ──
    async function execTool(name: string, args: any): Promise<any> {
      try {
        if (name === 'query_schedule') {
          const from = String(args?.date_from || today);
          const to = String(args?.date_to || addDays(from, 7));
          let q = admin.from('shift_schedules')
            .select('user_id, shift_code, work_date, shop_id')
            .gte('work_date', from).lte('work_date', to)
            .order('work_date');
          const { data: rows } = await q;
          if (!rows || rows.length === 0) return { rows: [], note: `${from} 至 ${to} 暂无排班数据` };

          // 收集 user_id → 姓名
          const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
          const [sp, pf, shiftsRes] = await Promise.all([
            admin.from('staff_profiles').select('user_id, real_name').in('user_id', ids),
            admin.from('profiles').select('user_id, display_name').in('user_id', ids),
            admin.from('shop_shifts').select('code, name, start_time, end_time, shop_id').eq('active', true),
          ]);
          const nameMap = new Map<string, string>();
          for (const r of (pf.data || []) as any[]) nameMap.set(r.user_id, r.display_name || '同事');
          for (const r of (sp.data || []) as any[]) if (r.real_name) nameMap.set(r.user_id, r.real_name);
          const shiftMap = new Map<string, any>();
          for (const s of (shiftsRes.data || []) as any[]) shiftMap.set(`${s.shop_id || '*'}|${s.code}`, s);

          const personQ = (args?.person || '').toString().trim().toLowerCase();
          const shopQ = (args?.shop || '').toString().trim().toLowerCase();

          const out = rows
            .map((r: any) => {
              const who = r.user_id === uid ? `${myName}(你)` : (nameMap.get(r.user_id) || '同事');
              const shop = shopMap.get(r.shop_id) || '未知门店';
              const def = shiftMap.get(`${r.shop_id || '*'}|${r.shift_code}`) || shiftMap.get(`*|${r.shift_code}`);
              const shiftLabel = def
                ? `${r.shift_code}班(${def.name}) ${String(def.start_time).slice(0,5)}-${String(def.end_time).slice(0,5)}`
                : `${r.shift_code}班`;
              return { date: r.work_date, who, shop, shift: shiftLabel, shift_code: r.shift_code };
            })
            .filter((row) => {
              if (personQ && !row.who.toLowerCase().includes(personQ)) return false;
              if (shopQ && !row.shop.toLowerCase().includes(shopQ)) return false;
              return true;
            })
            .slice(0, 100);

          return { rows: out, total: out.length };
        }

        if (name === 'query_my_stats') {
          const [expRes, pendingExpRes] = await Promise.all([
            admin.from('user_experience').select('total_exp, current_streak, longest_streak, last_check_in_date').eq('user_id', uid).maybeSingle(),
            admin.from('exp_pending').select('amount, title').eq('user_id', uid).is('claimed_at', null),
          ]);
          const pending = (pendingExpRes.data || []) as any[];
          return {
            total_exp: expRes.data?.total_exp ?? 0,
            current_streak: expRes.data?.current_streak ?? 0,
            longest_streak: expRes.data?.longest_streak ?? 0,
            checked_in_today: expRes.data?.last_check_in_date === today,
            pending_exp_count: pending.length,
            pending_exp_total: pending.reduce((s, p) => s + (p.amount || 0), 0),
          };
        }

        if (name === 'search_knowledge') {
          const q = String(args?.query || '').slice(0, 30);
          if (q.length < 2) return { rows: [] };
          const { data } = await admin
            .from('official_knowledge')
            .select('name, category, ip_name, summary, tips, era, origin')
            .or(`name.ilike.%${q}%,ip_name.ilike.%${q}%,summary.ilike.%${q}%,brand.ilike.%${q}%`)
            .limit(5);
          return { rows: data || [] };
        }

        if (name === 'search_shop_kb') {
          const q = String(args?.query || '').slice(0, 30);
          if (q.length < 2) return { rows: [] };
          const { data } = await admin
            .from('shop_kb_entries')
            .select('title, type, body, tags')
            .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
            .limit(5);
          return { rows: (data || []).map((r: any) => ({ ...r, body: String(r.body || '').slice(0, 300) })) };
        }

        if (name === 'search_my_history') {
          const q = String(args?.query || '').slice(0, 30);
          const lim = Math.min(Math.max(Number(args?.limit) || 5, 1), 10);
          if (q.length < 1) return { rows: [] };
          const { data } = await admin
            .from('products')
            .select('name, category, era, origin, created_at')
            .eq('created_by', uid)
            .ilike('name', `%${q}%`)
            .order('created_at', { ascending: false })
            .limit(lim);
          return { rows: data || [] };
        }

        return { error: 'unknown tool' };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'tool failed' };
      }
    }

    // ── 6) 准备模型消息（最近 16 轮）──
    const chatHistory = incoming
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-16)
      .map((m) => {
        const txt = extractText(m.content) || (typeof m.content === 'string' ? m.content : '');
        const imgs = Array.isArray(m.images) ? m.images.filter((u) => typeof u === 'string') : [];
        if (m.role === 'user' && imgs.length > 0) {
          return {
            role: 'user',
            content: [
              ...(txt ? [{ type: 'text', text: txt }] : []),
              ...imgs.map((url: string) => ({ type: 'image_url', image_url: { url } })),
            ],
          };
        }
        return { role: m.role, content: txt };
      });

    let modelMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
    ];

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return json({ error: 'LOVABLE_API_KEY 未配置' }, 500);

    // ── 7) 工具循环（最多 5 步）→ 最后一步开 stream ──
    let toolCallCount = 0;
    const maxToolSteps = 5;

    for (let step = 0; step < maxToolSteps; step++) {
      const nonStream = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature, max_tokens: maxTokens,
          messages: modelMessages,
          tools: TOOLS,
          tool_choice: 'auto',
        }),
      });

      if (!nonStream.ok) {
        if (nonStream.status === 429) return json({ error: '我有点累了，等我喘口气再聊？' }, 429);
        if (nonStream.status === 402) return json({ error: 'AI 额度不足，请联系管理员充值' }, 402);
        const t = await nonStream.text().catch(() => '');
        console.error('[spirit-chat] gateway tool step error', nonStream.status, t);
        return json({ error: '小精灵走神了，稍后再试' }, 500);
      }

      const data = await nonStream.json();
      const choice = data?.choices?.[0];
      const msg = choice?.message;
      const toolCalls = msg?.tool_calls;

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        // 执行所有工具
        modelMessages.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: toolCalls,
        });
        for (const call of toolCalls) {
          let parsed: any = {};
          try { parsed = JSON.parse(call.function?.arguments || '{}'); } catch {}
          const result = await execTool(call.function?.name, parsed);
          toolCallCount++;
          modelMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 4000),
          });
        }
        continue; // 进入下一步，让模型基于 tool 结果继续
      }

      // 没有工具调用 → 切换到流式拿最终答案
      break;
    }

    // 流式拿最终回答
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature, max_tokens: maxTokens, stream: true,
        messages: modelMessages,
      }),
    });

    if (!aiResp.ok || !aiResp.body) {
      if (aiResp.status === 429) return json({ error: '我有点累了，等我喘口气再聊？' }, 429);
      if (aiResp.status === 402) return json({ error: 'AI 额度不足，请联系管理员充值' }, 402);
      const t = await aiResp.text().catch(() => '');
      console.error('[spirit-chat] gateway stream error', aiResp.status, t);
      return json({ error: '小精灵走神了，稍后再试' }, 500);
    }

    // 边转发边累计 assistant 回复 → 流结束后落库 + 写用量 + 追加 __meta
    const reader = aiResp.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let assembled = '';
    let buffer = '';

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // 落库 assistant
          try {
            if (assembled.trim()) {
              await admin.from('spirit_messages').insert({
                conversation_id: conversationId,
                user_id: uid,
                role: 'assistant',
                content: assembled,
                meta: { tool_calls: toolCallCount, model },
              });
            }
            await admin.from('spirit_usage').insert({
              user_id: uid,
              conversation_id: conversationId,
              model,
              input_tokens: 0,
              output_tokens: assembled.length,
              tool_calls: toolCallCount,
              duration_ms: Date.now() - startedAt,
              status: 'ok',
            });
          } catch (e) {
            console.error('[spirit-chat] persist error', e);
          }
          // 追加 meta 帧
          const meta = JSON.stringify({ __meta: { conversationId, toolCalls: toolCallCount, model } });
          controller.enqueue(encoder.encode(`data: ${meta}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        // 提取 delta 内容用于累计
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            const delta = obj?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') assembled += delta;
          } catch {}
        }
        // 直接转发原始 chunk
        controller.enqueue(value);
      },
      cancel() {
        try { reader.cancel(); } catch {}
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('[spirit-chat] error', e);
    return json({ error: e instanceof Error ? e.message : '未知错误' }, 500);
  }
});
