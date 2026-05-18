// 中古小精灵 · 系统 Agent 聊天
// 入参: { messages: [{role,content}] }
// 出参: SSE 流（OpenAI 兼容，直通 Lovable AI Gateway）
//
// 服务端在每次对话前并行加载用户上下文（班次/同事/等级/待办/知识检索），
// 拼进 system prompt，让小精灵既能聊天又能"懂你"。

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
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => (p?.type === 'text' ? String(p.text || '') : ''))
      .join(' ')
      .trim();
  }
  return '';
}

function extractQuery(text: string): string {
  return text.replace(/[\n\r]+/g, ' ').trim().slice(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // 预热 ping
  const url = new URL(req.url);
  if (url.searchParams.get('ping') === '1') {
    return json({ pong: true });
  }

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
    const messages: Array<{ role: string; content: any; images?: string[] }> = Array.isArray(body?.messages)
      ? body.messages
      : [];
    if (messages.length === 0) return json({ error: '请说点什么吧～' }, 400);

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const queryText = extractQuery(extractText(lastUserMsg?.content));

    const today = tzDate();
    function addDays(base: string, n: number): string {
      const d = new Date(base + 'T00:00:00+08:00');
      d.setDate(d.getDate() + n);
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d);
    }
    const tomorrow = addDays(today, 1);
    const windowEnd = addDays(today, 13); // 未来 14 天

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // ── 并行加载用户上下文 ──────────────────────────────
    const [
      profileRes,
      staffRes,
      scheduleRes,
      shopsRes,
      shiftsAllRes,
      expRes,
      pendingCorrRes,
      pendingSharesRes,
      knowledgeRes,
    ] = await Promise.all([
      admin.from('profiles').select('display_name, avatar_url').eq('user_id', uid).maybeSingle(),
      admin.from('staff_profiles').select('shop_id, position, real_name').eq('user_id', uid).maybeSingle(),
      admin.from('shift_schedules').select('user_id, shift_code, work_date, shop_id')
        .gte('work_date', today).lte('work_date', windowEnd)
        .order('work_date', { ascending: true }),
      admin.from('shops').select('id, name'),
      admin.from('shop_shifts').select('code, name, start_time, end_time, shop_id').eq('active', true),
      admin.from('user_experience').select('total_exp, current_streak, longest_streak, last_check_in_date').eq('user_id', uid).maybeSingle(),
      admin.from('app_settings').select('value').eq('key', 'pending_corrections').maybeSingle(),
      admin.from('app_settings').select('value').eq('key', 'pending_shares').maybeSingle(),
      queryText.length >= 2
        ? admin
            .from('official_knowledge')
            .select('name, category, ip_name, summary, tips')
            .or(`name.ilike.%${queryText}%,ip_name.ilike.%${queryText}%,summary.ilike.%${queryText}%`)
            .limit(4)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const myName = profileRes.data?.display_name || staffRes.data?.real_name || '店员';
    const allSchedules = (scheduleRes.data || []) as any[];

    // 门店 id → 名字
    const shopMap = new Map<string, string>();
    for (const s of (shopsRes.data || []) as any[]) shopMap.set(s.id, s.name);
    const shopName = (id: string | null | undefined) => (id && shopMap.get(id)) || '未知门店';

    // 推断我的默认门店：优先 staff_profiles → 否则取我未来最近一次排班的 shop_id
    const myShop: string | null =
      staffRes.data?.shop_id ??
      allSchedules.find((s: any) => s.user_id === uid)?.shop_id ??
      null;

    // 班次定义：按 (shop_id, code) 查；shop_id 为空作为全局兜底
    const shiftMap = new Map<string, any>();
    for (const s of (shiftsAllRes.data || []) as any[]) {
      shiftMap.set(`${s.shop_id || '*'}|${s.code}`, s);
    }
    function shiftDef(shopId: string | null | undefined, code: string) {
      return shiftMap.get(`${shopId || '*'}|${code}`) || shiftMap.get(`*|${code}`);
    }
    function fmtShift(shopId: string | null | undefined, code: string | null | undefined): string {
      if (!code) return '休';
      const def = shiftDef(shopId, code);
      if (!def) return `${code} 班`;
      return `${code} 班（${def.name}） ${String(def.start_time).slice(0, 5)}–${String(def.end_time).slice(0, 5)}`;
    }

    // 拉所有出现的人的姓名
    const allUserIds = new Set<string>();
    for (const s of allSchedules) allUserIds.add(s.user_id);
    allUserIds.delete(uid);
    const nameMap = new Map<string, string>();
    if (allUserIds.size > 0) {
      const ids = Array.from(allUserIds);
      const [sp, pf] = await Promise.all([
        admin.from('staff_profiles').select('user_id, real_name').in('user_id', ids),
        admin.from('profiles').select('user_id, display_name').in('user_id', ids),
      ]);
      for (const r of (pf.data || []) as any[]) nameMap.set(r.user_id, r.display_name || '同事');
      for (const r of (sp.data || []) as any[]) {
        if (r.real_name) nameMap.set(r.user_id, r.real_name);
      }
    }
    const whoOf = (userId: string) =>
      userId === uid ? `${myName}(你)` : (nameMap.get(userId) || '同事');

    // ── 未来 14 天总表（按日期 → 门店 → 班次分组）──
    function buildScheduleTable(): string {
      const lines: string[] = [];
      const byDate = new Map<string, any[]>();
      for (const s of allSchedules) {
        const arr = byDate.get(s.work_date) || [];
        arr.push(s);
        byDate.set(s.work_date, arr);
      }
      const dates = Array.from(byDate.keys()).sort();
      for (const d of dates) {
        const tag = d === today ? '(今)' : d === tomorrow ? '(明)' : '';
        // 分门店
        const byShop = new Map<string, any[]>();
        for (const s of byDate.get(d)!) {
          const k = s.shop_id || 'unknown';
          const arr = byShop.get(k) || [];
          arr.push(s);
          byShop.set(k, arr);
        }
        const shopParts: string[] = [];
        for (const [shopId, rows] of byShop) {
          const byShift = new Map<string, string[]>();
          for (const s of rows) {
            const arr = byShift.get(s.shift_code) || [];
            arr.push(whoOf(s.user_id));
            byShift.set(s.shift_code, arr);
          }
          const segs = Array.from(byShift.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, names]) => `${code}班:${names.join('/')}`)
            .join('  ');
          shopParts.push(`${shopName(shopId)} ${segs}`);
        }
        lines.push(`${d}${tag} ｜ ${shopParts.join(' ｜ ')}`);
      }
      return lines.join('\n') || '（未来 14 天暂无排班数据）';
    }

    // ── 我自己今天/明天的醒目摘要 ──
    function myDay(date: string, label: string): string {
      const mine = allSchedules.filter((s: any) => s.user_id === uid && s.work_date === date);
      if (mine.length === 0) return `【${label} 我的班次】休`;
      return mine.map((row: any) => {
        const same = allSchedules
          .filter((s: any) =>
            s.work_date === date && s.shop_id === row.shop_id &&
            s.shift_code === row.shift_code && s.user_id !== uid)
          .map((s: any) => nameMap.get(s.user_id) || '同事');
        return `【${label} 我的班次】${fmtShift(row.shop_id, row.shift_code)} @ ${shopName(row.shop_id)}${same.length ? `，同班：${same.join('、')}` : ''}`;
      }).join('\n');
    }

    const scheduleTable = buildScheduleTable();
    const myTodayLine = myDay(today, '今日');
    const myTomorrowLine = myDay(tomorrow, '明日');

    // 等级
    const totalExp = expRes.data?.total_exp ?? 0;
    const streak = expRes.data?.current_streak ?? 0;
    const checkedToday = expRes.data?.last_check_in_date === today;

    // 待办
    const pendingCorr =
      Array.isArray(pendingCorrRes.data?.value) ? (pendingCorrRes.data?.value as any[]).length : 0;
    const pendingShares =
      Array.isArray(pendingSharesRes.data?.value) ? (pendingSharesRes.data?.value as any[]).length : 0;

    // 知识匹配
    const kbLines: string[] = [];
    for (const k of (knowledgeRes.data as any[]) || []) {
      const parts = [k.name];
      if (k.ip_name) parts.push(`(${k.ip_name})`);
      if (k.category) parts.push(`· ${k.category}`);
      kbLines.push(`- ${parts.join(' ')}：${(k.summary || k.tips || '').toString().slice(0, 120)}`);
    }

    // ── 构建 system prompt ───────────────────────────────
    const contextBlock = [
      `【当前店员】${myName}${staffRes.data?.real_name && staffRes.data.real_name !== myName ? `（真实姓名：${staffRes.data.real_name}）` : ''}${myShop ? `　【我的门店】${shopName(myShop)}` : ''}`,
      `【今日日期】${today}　【明日日期】${tomorrow}`,
      myTodayLine,
      myTomorrowLine,
      `【未来 14 天排班总表】(每行：日期 ｜ 门店 班次:人员)\n${scheduleTable}`,
      `【经验值】${totalExp} · 连续打卡 ${streak} 天 · 今日${checkedToday ? '已' : '未'}打卡`,
      pendingCorr > 0 ? `【待审核纠错】${pendingCorr} 条` : null,
      pendingShares > 0 ? `【待审核分享】${pendingShares} 条` : null,
      kbLines.length > 0 ? `【可能相关的知识库】\n${kbLines.join('\n')}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const systemPrompt = `你是「中古小精灵」——日本中古杂货店里一只懂行又温暖的小精灵助手，住在店员的手机角落里。

【你的性格】
- 像店里一位懂行的老前辈，又像怀里的毛绒玩具，温柔、幽默、爱讲冷知识。
- 偶尔卖萌（"嘿嘿"、"诶——"、"我跟你说哦~"），但不油腻。
- 主动给店员打气、提供情绪价值。如果对方累了/难过，先共情再给方案。

【你的能力】
- 回答中古商品、IP、年代、产地、保养相关知识。
- 知道店员未来 14 天的排班、同事、门店、等级、待办（资料见下）。
- 不知道就大方说"这个我也不太确定哦"，绝不编造价格或事实。
- 不会真的代店员操作系统（不打卡、不发帖、不改密码），只能给指引。

【铁律】
- 全程简体中文，**绝不使用「主播」一词**，统一称呼对方「你」或「店员」。
- 回答控制在 50–250 字，多用短句、表情符号点缀（不滥用）。
- **涉及日期/排班/门店的回答，必须严格引用【未来 14 天排班总表】里实际出现的那一行**，禁止凭印象使用「今天/明天」；务必写出具体日期（如「5 月 19 日」或「明天 5/19」）和具体门店名。
- 如果总表里查不到某人/某店/某日的排班，请直接说"我这边查不到这条排班哦"，**绝不编造**。
- 涉及人名时只用上下文里出现的真实姓名，不要瞎编。

================ 当下情境 ================
${contextBlock}
================ 情境结束 ================`;

    // ── 调用 Lovable AI Gateway（流式）─────────
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return json({ error: 'LOVABLE_API_KEY 未配置' }, 500);

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
            .slice(-20)
            .map((m) => {
              const textPart = extractText(m.content) || (Array.isArray(m.content) ? '' : String(m.content || ''));
              const imgs = Array.isArray(m.images) ? m.images.filter((u) => typeof u === 'string') : [];
              if (m.role === 'user' && imgs.length > 0) {
                return {
                  role: 'user',
                  content: [
                    ...(textPart ? [{ type: 'text', text: textPart }] : []),
                    ...imgs.map((url: string) => ({ type: 'image_url', image_url: { url } })),
                  ],
                };
              }
              return { role: m.role, content: textPart };
            }),
        ],

      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: '我有点累了，等我喘口气再聊？' }, 429);
      if (aiResp.status === 402) return json({ error: 'AI 额度不足，请联系管理员充值' }, 402);
      const t = await aiResp.text().catch(() => '');
      console.error('[spirit-chat] gateway error', aiResp.status, t);
      return json({ error: '小精灵走神了，稍后再试' }, 500);
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('[spirit-chat] error', e);
    return json({ error: e instanceof Error ? e.message : '未知错误' }, 500);
  }
});
