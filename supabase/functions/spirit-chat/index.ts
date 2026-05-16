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
    const messages: Array<{ role: string; content: string }> = Array.isArray(body?.messages)
      ? body.messages
      : [];
    if (messages.length === 0) return json({ error: '请说点什么吧～' }, 400);

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const queryText = extractQuery(lastUserMsg);
    const today = tzDate();
    // 明天日期（Asia/Shanghai）
    const tomorrow = (() => {
      const d = new Date(today + 'T00:00:00+08:00');
      d.setDate(d.getDate() + 1);
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d);
    })();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // ── 并行加载用户上下文 ──────────────────────────────
    const [
      profileRes,
      staffRes,
      todayScheduleRes,
      tomorrowScheduleRes,
      myRecentScheduleRes,
      expRes,
      pendingCorrRes,
      pendingSharesRes,
      knowledgeRes,
    ] = await Promise.all([
      admin.from('profiles').select('display_name, avatar_url').eq('user_id', uid).maybeSingle(),
      admin.from('staff_profiles').select('shop_id, position, real_name').eq('user_id', uid).maybeSingle(),
      admin.from('shift_schedules').select('user_id, shift_code, work_date, shop_id').eq('work_date', today),
      admin.from('shift_schedules').select('user_id, shift_code, work_date, shop_id').eq('work_date', tomorrow),
      // 用我自己最近 30 天的排班反推默认门店（兜底当 staff_profiles.shop_id 为空时）
      admin.from('shift_schedules').select('shop_id, work_date').eq('user_id', uid)
        .gte('work_date', today).order('work_date', { ascending: true }).limit(5),
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
    // 推断 shop_id：优先 staff_profiles → 否则取我自己今天/明天/最近排班里的 shop_id
    const myShop: string | null =
      staffRes.data?.shop_id ??
      todayScheduleRes.data?.find((s: any) => s.user_id === uid)?.shop_id ??
      tomorrowScheduleRes.data?.find((s: any) => s.user_id === uid)?.shop_id ??
      myRecentScheduleRes.data?.[0]?.shop_id ??
      null;

    // 加载该门店班次定义（一次拉，今天/明天共用）
    const shiftsRes = myShop
      ? await admin.from('shop_shifts').select('code, name, start_time, end_time')
          .or(`shop_id.eq.${myShop},shop_id.is.null`).eq('active', true)
      : { data: [] as any[] };
    const shiftMap = new Map<string, any>();
    for (const s of (shiftsRes.data || []) as any[]) shiftMap.set(s.code, s);

    function fmtShift(code: string | null | undefined): string {
      if (!code) return '休';
      const def = shiftMap.get(code);
      if (!def) return `${code} 班`;
      return `${code} 班（${def.name}） ${String(def.start_time).slice(0, 5)}–${String(def.end_time).slice(0, 5)}`;
    }

    // 一次性把当天/明天涉及到的所有 user_id 拉真实姓名
    const allUserIds = new Set<string>();
    for (const s of (todayScheduleRes.data || []) as any[]) allUserIds.add(s.user_id);
    for (const s of (tomorrowScheduleRes.data || []) as any[]) allUserIds.add(s.user_id);
    allUserIds.delete(uid);
    let nameMap = new Map<string, string>();
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

    function describeDay(label: string, rows: any[]): string {
      const myRow = rows.find((s: any) => s.user_id === uid && (!myShop || s.shop_id === myShop));
      const myShift = myRow?.shift_code || null;
      const sameShift = rows
        .filter((s: any) => myShift && s.shift_code === myShift && s.user_id !== uid && (!myShop || s.shop_id === myShop))
        .map((s: any) => nameMap.get(s.user_id) || '同事');
      // 同店全部班次概览（按班次分组）
      const byShift = new Map<string, string[]>();
      for (const s of rows) {
        if (myShop && s.shop_id !== myShop) continue;
        const arr = byShift.get(s.shift_code) || [];
        const nm = s.user_id === uid ? `${myName}(你)` : (nameMap.get(s.user_id) || '同事');
        arr.push(nm);
        byShift.set(s.shift_code, arr);
      }
      const overview = Array.from(byShift.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, names]) => `${code}班：${names.join('、')}`)
        .join('；');
      const lines = [
        `【${label}班次】${myShift ? fmtShift(myShift) : '没有排班（可以休息）'}`,
        `【${label}同班同事】${sameShift.length > 0 ? sameShift.join('、') : (myShift ? '暂无（可能独立值班）' : '—')}`,
      ];
      if (overview) lines.push(`【${label}门店班表】${overview}`);
      return lines.join('\n');
    }

    const todayBlock = describeDay('今日', (todayScheduleRes.data || []) as any[]);
    const tomorrowBlock = describeDay('明日', (tomorrowScheduleRes.data || []) as any[]);

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
      `【当前店员】${myName}${staffRes.data?.real_name && staffRes.data.real_name !== myName ? `（真实姓名：${staffRes.data.real_name}）` : ''}`,
      `【今日日期】${today}　【明日日期】${tomorrow}`,
      todayBlock,
      tomorrowBlock,
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
- 知道店员今天的排班、同事、等级、待办（资料见下）。
- 不知道就大方说"这个我也不太确定哦"，绝不编造价格或事实。
- 不会真的代店员操作系统（不打卡、不发帖、不改密码），只能给指引。

【铁律】
- 全程简体中文，**绝不使用「主播」一词**，统一称呼对方「你」或「店员」。
- 回答控制在 50–250 字，多用短句、表情符号点缀（不滥用）。
- 涉及人/班次的回答，请用上下文里的真实姓名，不要瞎编。

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
            .map((m) => ({ role: m.role, content: String(m.content || '') })),
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
