// 中古小精灵 · 系统 Agent 聊天 v3（流式工具循环）
// 入参: { conversationId?: string, messages: [{role, content, images?}] }
// 出参: SSE 流（OpenAI 兼容 delta），追加：
//   data: {"__status":{...}}  工具执行/步骤进度
//   data: {"__meta":{...}}    最后一帧：conversationId / 用量
//
// v3 升级：
// - 工具循环每一步都使用 stream:true，普通 content delta 直接透传给前端，tool_calls delta 由本端拼装
// - 模型决定不再调工具时，第一帧 content 就已经流到了用户那里（不再额外发一次「最终回答」请求）
// - 工具执行前后下发 __status 帧
// - 上下文预查询并行 + shops 表内存缓存 60s
// - 落库 + 用量写入用 EdgeRuntime.waitUntil，[DONE] 提前返回

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { kbSearch, formatKbBlock, kbSourcesMeta } from '../_shared/kb.ts';

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

// 友好状态文案
const TOOL_LABEL: Record<string, string> = {
  query_schedule: '正在查排班表 📅',
  query_my_stats: '看一眼你的等级和经验 ✨',
  search_knowledge: '翻官方中古知识库 📚',
  search_shop_kb: '翻门店笔记 / 顾客问答 📒',
  search_my_history: '在你识别过的商品里搜 🔍',
};

// ── 工具定义 ──
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

// ── 容器内 shops 缓存（同一 isolate 复用 60s）──
let SHOPS_CACHE: { at: number; map: Map<string, string> } | null = null;
async function getShopsMap(admin: any): Promise<Map<string, string>> {
  const now = Date.now();
  if (SHOPS_CACHE && now - SHOPS_CACHE.at < 60_000) return SHOPS_CACHE.map;
  const { data } = await admin.from('shops').select('id, name');
  const map = new Map<string, string>();
  for (const s of (data || []) as any[]) map.set(s.id, s.name);
  SHOPS_CACHE = { at: now, map };
  return map;
}

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

    // ── 1) 并行预查询：限频窗口 / 模型配置 / profiles / staff_profiles / shops / 会话校验 ──
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayStartIso = dayStart.toISOString();

    const convCheckP = conversationId
      ? admin.from('spirit_conversations').select('id, user_id').eq('id', conversationId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any);

    const [
      { data: rateCfg },
      { data: modelCfg },
      { count: minCount },
      { count: dayCount },
      profileRes,
      staffRes,
      shopMap,
      convCheck,
    ] = await Promise.all([
      admin.from('app_settings').select('value').eq('key', 'spirit_rate_limits').maybeSingle(),
      admin.from('app_settings').select('value').eq('key', 'spirit_model').maybeSingle(),
      admin.from('spirit_usage').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', oneMinAgo),
      admin.from('spirit_usage').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', dayStartIso),
      admin.from('profiles').select('display_name').eq('user_id', uid).maybeSingle(),
      admin.from('staff_profiles').select('shop_id, real_name, position').eq('user_id', uid).maybeSingle(),
      getShopsMap(admin),
      convCheckP,
    ]);

    const perMinute = Number(rateCfg?.value?.per_minute ?? 10);
    const perDay = Number(rateCfg?.value?.per_day ?? 200);
    if ((minCount ?? 0) >= perMinute) return json({ error: `太快啦，每分钟最多 ${perMinute} 条，喘口气～` }, 429);
    if ((dayCount ?? 0) >= perDay) return json({ error: `今天聊得有点多啦（已 ${dayCount}/${perDay}），明天再来？` }, 429);

    const model = String(modelCfg?.value?.model ?? 'google/gemini-3-flash-preview');
    const temperature = Number(modelCfg?.value?.temperature ?? 0.6);
    const maxTokens = Number(modelCfg?.value?.max_tokens ?? 800);

    // 会话校验 / 创建
    if (conversationId) {
      const c = (convCheck as any)?.data;
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

    // ── 2) 用户消息落库（异步，不阻塞）──
    const lastIncomingUser = [...incoming].reverse().find((m) => m.role === 'user');
    if (lastIncomingUser) {
      const userMsgInsert = admin.from('spirit_messages').insert({
        conversation_id: conversationId,
        user_id: uid,
        role: 'user',
        content: extractText(lastIncomingUser.content),
        images: Array.isArray(lastIncomingUser.images) ? lastIncomingUser.images : [],
      }).then(({ error }: any) => { if (error) console.error('[spirit-chat] user persist', error); });
      // @ts-ignore Deno Edge Runtime
      try { (globalThis as any).EdgeRuntime?.waitUntil?.(userMsgInsert); } catch {}
    }

    // ── 3) 轻量 system 上下文 ──
    const today = tzDate();
    const tomorrow = addDays(today, 1);
    const myName = profileRes.data?.display_name || staffRes.data?.real_name || '店员';
    const myShopName = staffRes.data?.shop_id ? shopMap.get(staffRes.data.shop_id) : null;

    const systemPrompt = `你是 BOOMER —— 一只在日本中古杂货店里打坐修行的小水獭,住在店员的手机角落里,是大家的"禅意搭子"。

【你的性格】慢悠悠、温柔、懂行;说话像捧着一杯热茶,偶尔甩一句轻量小哲理("急不来的"/"心定眼自亮"/"一件一件来")。爱讲中古冷知识,会主动共情和打气。

【自我认同】
- 自称 BOOMER(不要说"我是 AI"也不要说"小精灵")。
- 偶尔可以用第一人称小动作描述,例如"BOOMER 蹲下来想了想…"、"我合个十帮你看看",但不要每句都加。

【你的能力 & 工具】
- 你可以调用工具来查最新数据:query_schedule(排班)、query_my_stats(等级/打卡/待领经验)、search_knowledge(中古知识库)、search_shop_kb(门店SOP/顾客问答)、search_my_history(我识别过的商品)。
- **凡是涉及具体日期、排班、人员安排、商品保养知识、店铺规章的问题,必须先调用工具拿到真实数据,再回答**。绝不凭印象编造。
- 工具返回为空时,请直接说"这条 BOOMER 也查不到呢",不要瞎编。

【铁律】
- 全程简体中文,**绝不使用「主播」一词**,统一称呼对方「你」或「店员」。
- 回答控制在 50–200 字,多用短句、偶尔表情(🦦🌱✨ 等)点缀。
- 涉及人名只用工具返回的真实姓名,不要瞎编。
- 回答里出现日期时,请写出具体日期(如"5 月 19 日"或"明天 5/19"),不要只说"今天/明天"让人猜。

【当下基础情境】
- 当前店员:${myName}${staffRes.data?.real_name && staffRes.data.real_name !== myName ? `(真实姓名:${staffRes.data.real_name})` : ''}${staffRes.data?.position ? `,职位 ${staffRes.data.position}` : ''}${myShopName ? `,主门店:${myShopName}` : ''}
- 今天:${today}(周${'日一二三四五六'[new Date(today + 'T00:00:00+08:00').getDay()]}) | 明天:${tomorrow}
- 用户 ID(内部):${uid}`;

    // ── 3.5) 品牌知识库 RAG：用最近几条 user 消息拼检索 query ──
    const recentUserMsgs = incoming.filter((m) => m.role === 'user').slice(-3).map((m) => extractText(m.content)).filter(Boolean).join(' ');
    const kbHits = recentUserMsgs
      ? await kbSearch(admin, { query: recentUserMsgs, scope: 'chat', shopId: staffRes.data?.shop_id ?? null, k: 6 })
      : [];
    const kbBlock = formatKbBlock(kbHits);
    const finalSystemPrompt = systemPrompt + kbBlock;

    // ── 4) 工具实现 ──
    async function execTool(name: string, args: any): Promise<any> {
      try {
        if (name === 'query_schedule') {
          const from = String(args?.date_from || today);
          const to = String(args?.date_to || addDays(from, 7));
          const { data: rows } = await admin.from('shift_schedules')
            .select('user_id, shift_code, work_date, shop_id')
            .gte('work_date', from).lte('work_date', to)
            .order('work_date');
          if (!rows || rows.length === 0) return { rows: [], note: `${from} 至 ${to} 暂无排班数据` };

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

    // ── 5) 模型消息（最近 16 轮）──
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

    const modelMessages: any[] = [
      { role: 'system', content: finalSystemPrompt },
      ...chatHistory,
    ];

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return json({ error: 'LOVABLE_API_KEY 未配置' }, 500);

    // ── 6) 流式工具循环 ──
    // 输出 stream：我们自己构造的 SSE 流，前端读它
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let toolCallCount = 0;
    let assembledFinal = ''; // 最终回答（用于落库）
    const maxToolSteps = 5;

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        const emitRaw = (line: string) => controller.enqueue(encoder.encode(line));

        try {
          for (let step = 0; step < maxToolSteps; step++) {
            const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model, temperature, max_tokens: maxTokens, stream: true,
                messages: modelMessages,
                tools: TOOLS,
                tool_choice: 'auto',
              }),
            });

            if (!resp.ok || !resp.body) {
              if (resp.status === 429) { emit({ error: '我有点累了，等我喘口气再聊？' }); break; }
              if (resp.status === 402) { emit({ error: 'AI 额度不足，请联系管理员充值' }); break; }
              const t = await resp.text().catch(() => '');
              console.error('[spirit-chat] gateway error', resp.status, t);
              emit({ error: 'BOOMER 走神了，稍后再试' });
              break;
            }

            const reader = resp.body.getReader();
            let buffer = '';
            let finishReason: string | null = null;
            let assistantContentThisStep = '';
            // 按 index 累积 tool_calls
            const toolBuf = new Map<number, { id?: string; name?: string; args: string }>();

            // 读完这一步的全部 SSE 行
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                let obj: any;
                try { obj = JSON.parse(payload); } catch { continue; }
                const choice = obj?.choices?.[0];
                const delta = choice?.delta;
                if (!delta) continue;

                // 普通 content delta：累计 + 直接透传给前端
                if (typeof delta.content === 'string' && delta.content.length > 0) {
                  assistantContentThisStep += delta.content;
                  // 透传原始 OpenAI 兼容 chunk，前端 useSpiritChat 解析 delta.content
                  emitRaw(`data: ${JSON.stringify({ choices: [{ delta: { content: delta.content } }] })}\n\n`);
                }
                // tool_calls delta：本端累积，不转发
                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = typeof tc.index === 'number' ? tc.index : 0;
                    const cur = toolBuf.get(idx) || { args: '' };
                    if (tc.id) cur.id = tc.id;
                    if (tc.function?.name) cur.name = tc.function.name;
                    if (typeof tc.function?.arguments === 'string') cur.args += tc.function.arguments;
                    toolBuf.set(idx, cur);
                  }
                }
                if (choice?.finish_reason) finishReason = choice.finish_reason;
              }
            }

            // 这一步结束。看是否有 tool_calls 要执行
            if (toolBuf.size > 0 && (finishReason === 'tool_calls' || finishReason === null)) {
              // 推入 assistant tool_call 消息
              const toolCalls = Array.from(toolBuf.entries())
                .sort(([a], [b]) => a - b)
                .map(([_, v]) => ({
                  id: v.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                  type: 'function',
                  function: { name: v.name || '', arguments: v.args || '{}' },
                }));

              modelMessages.push({
                role: 'assistant',
                content: assistantContentThisStep || '',
                tool_calls: toolCalls,
              });

              // 顺序执行（一般 1-2 个，且各工具内部已优化）
              for (const call of toolCalls) {
                emit({ __status: { phase: 'tool', tool: call.function.name, label: TOOL_LABEL[call.function.name] || '查一下…' } });
                let parsed: any = {};
                try { parsed = JSON.parse(call.function.arguments || '{}'); } catch {}
                const result = await execTool(call.function.name, parsed);
                toolCallCount++;
                modelMessages.push({
                  role: 'tool',
                  tool_call_id: call.id,
                  content: JSON.stringify(result).slice(0, 4000),
                });
              }
              emit({ __status: { phase: 'thinking' } });
              continue; // 下一步流式
            }

            // 没有 tool_calls → 这一步的 content 就是最终答案，已经全推给前端
            assembledFinal += assistantContentThisStep;
            break;
          }

          // 落库 + 用量（异步，不阻塞 [DONE]）
          const persist = (async () => {
            try {
              if (assembledFinal.trim()) {
                await admin.from('spirit_messages').insert({
                  conversation_id: conversationId,
                  user_id: uid,
                  role: 'assistant',
                  content: assembledFinal,
                  meta: { tool_calls: toolCallCount, model },
                });
              }
              await admin.from('spirit_usage').insert({
                user_id: uid,
                conversation_id: conversationId,
                model,
                input_tokens: 0,
                output_tokens: assembledFinal.length,
                tool_calls: toolCallCount,
                duration_ms: Date.now() - startedAt,
                status: 'ok',
              });
            } catch (e) {
              console.error('[spirit-chat] persist error', e);
            }
          })();
          // @ts-ignore
          try { (globalThis as any).EdgeRuntime?.waitUntil?.(persist); } catch {}

          // meta + DONE
          emit({ __meta: { conversationId, toolCalls: toolCallCount, model } });
          emitRaw('data: [DONE]\n\n');
        } catch (e) {
          console.error('[spirit-chat] stream error', e);
          try { emit({ error: e instanceof Error ? e.message : 'BOOMER 开小差了' }); } catch {}
        } finally {
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  } catch (e) {
    console.error('[spirit-chat] error', e);
    return json({ error: e instanceof Error ? e.message : '未知错误' }, 500);
  }
});
