import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function dow(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

async function callAI(payload: any, apiKey: string): Promise<any> {
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: payload.system },
        { role: 'user', content: payload.user },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'submit_schedule',
          description: '提交一周的排班结果',
          parameters: {
            type: 'object',
            properties: {
              assignments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    shift_code: { type: 'string' },
                    user_ids: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['date', 'shift_code', 'user_ids'],
                },
              },
            },
            required: ['assignments'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'submit_schedule' } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('AI 未返回排班');
  return JSON.parse(args);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY 未配置');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!userData?.user) return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: '仅管理员可调用' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const weekStart: string = body.week_start;
    const shopId: string | null = body.shop_id || null;
    const overwrite: boolean = body.overwrite !== false;
    if (!weekStart) throw new Error('缺少 week_start');
    if (!shopId) throw new Error('缺少 shop_id');

    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekEnd = days[6];

    const [{ data: shifts }, { data: profiles }, { data: holidays }, { data: roleList }, { data: dayOffs }, { data: existing }] = await Promise.all([
      supabase.from('shop_shifts').select('*').eq('active', true).or(`shop_id.eq.${shopId},shop_id.is.null`).order('sort_order'),
      supabase.from('staff_profiles').select('*'),
      supabase.from('shop_holidays').select('*').or(`shop_id.eq.${shopId},shop_id.is.null`).gte('date', weekStart).lte('date', weekEnd),
      supabase.from('user_roles').select('user_id').eq('suspended', false),
      supabase.from('staff_day_offs').select('*').gte('off_date', weekStart).lte('off_date', weekEnd),
      supabase.from('shift_schedules').select('work_date, shift_code, user_id, source').eq('shop_id', shopId).gte('work_date', weekStart).lte('work_date', weekEnd),
    ]);
    const existingRows: any[] = existing || [];
    const occupiedUserDate = new Set<string>(existingRows.map((r: any) => `${r.work_date}_${r.user_id}`));
    const weekCountByUser = new Map<string, number>();
    existingRows.forEach((r: any) => weekCountByUser.set(r.user_id, (weekCountByUser.get(r.user_id) || 0) + 1));

    const userIds = (roleList || []).map((r: any) => r.user_id);
    const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
    const nameMap = new Map<string, string>();
    (profs || []).forEach((p: any) => nameMap.set(p.user_id, p.display_name || '店员'));

    const profMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => profMap.set(p.user_id, p));

    const dayOffMap = new Map<string, string[]>();
    (dayOffs || []).forEach((o: any) => {
      // 仅当 shop_id 为空(全部门店)或等于当前门店时生效
      if (o.shop_id && o.shop_id !== shopId) return;
      const arr = dayOffMap.get(o.user_id) || [];
      arr.push(o.off_date);
      dayOffMap.set(o.user_id, arr);
    });

    // 过滤员工：可上班门店包含当前 shopId,或主门店等于,或都为空
    const staffList = userIds.flatMap((uid: string) => {
      const p = profMap.get(uid) || {};
      const allowedShops: string[] = p.allowed_shop_ids || [];
      const mainShop: string | null = p.shop_id || null;
      const eligible = (allowedShops.length === 0 && !mainShop)
        || allowedShops.includes(shopId)
        || mainShop === shopId;
      if (!eligible) return [];
      return [{
        user_id: uid,
        name: nameMap.get(uid) || '店员',
        type: p.employment_type || 'regular',
        weekly_workdays: p.weekly_workdays ?? 5,
        max_per_week: p.max_per_week ?? 5,
        available_weekdays: p.available_weekdays || [0,1,2,3,4,5,6],
        blocked_weekdays: p.blocked_weekdays || [],
        preferred_shifts: p.preferred_shifts || [],
        blocked_shifts: p.blocked_shifts || [],
        day_offs: dayOffMap.get(uid) || [],
      }];
    });

    const holMap = new Map<string, any>();
    (holidays || []).forEach((h: any) => holMap.set(h.date, h));

    const system = `你是门店排班助手。请为下列日期、班次和员工生成一周排班方案，必须严格遵守以下硬约束（违反任意一条都视为失败）：
1. 仅可使用提供的 shift_code 和 user_id；
2. 每个员工每天最多排一个班次；
3. 仅在该员工的 available_weekdays 内排班；
4. 员工的 blocked_weekdays（固定休息日）和 day_offs（具体禁排日期）绝不安排；
5. 员工的 blocked_shifts 列表中的班次绝不安排该员工；
6. 每个员工每周上班天数绝对不得超过 5 天，也不得超过 max_per_week，已包含 existing_count 中已有天数；尽量接近 weekly_workdays；
7. 优先匹配员工的 preferred_shifts（如为空则不限）；
8. 节假日规则：当日 full_staff_off=true 时正式员工(type=regular)不排；intern_works=true 时实习生照常排，否则也不排；
9. 同一员工不要连续上班超过 6 天；
10. 每个班次每天至少安排 1 名员工，尽量人员均衡；
11. 已存在的 occupied (date,user_id) 列表绝不能再排该员工到该日期；只填补空缺的人/日。
输出工具 submit_schedule 严格 JSON。日期使用 ISO YYYY-MM-DD。`;

    const user = JSON.stringify({
      shop_id: shopId,
      week: days.map(d => ({ date: d, weekday: WEEK_LABEL[dow(d)], holiday: holMap.get(d) || null })),
      shifts: (shifts || []).map((s: any) => ({ code: s.code, name: s.name, time: `${s.start_time}-${s.end_time}` })),
      staff: staffList.map(s => ({ ...s, existing_count: weekCountByUser.get(s.user_id) || 0 })),
      occupied: existingRows.map((r: any) => ({ date: r.work_date, user_id: r.user_id })),
    }, null, 2);

    if (staffList.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: 0, message: '该门店无可排员工' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await callAI({ system, user }, apiKey);
    const assignments = Array.isArray(result.assignments) ? result.assignments : [];

    if (overwrite) {
      await supabase.from('shift_schedules').delete().eq('shop_id', shopId).gte('work_date', weekStart).lte('work_date', weekEnd);
      occupiedUserDate.clear();
      weekCountByUser.clear();
    }

    const validShifts = new Set((shifts || []).map((s: any) => s.code));
    const validUsers = new Set(staffList.map(s => s.user_id));
    const staffIndex = new Map(staffList.map(s => [s.user_id, s]));

    const rows: any[] = [];
    for (const a of assignments) {
      if (!days.includes(a.date) || !validShifts.has(a.shift_code)) continue;
      const wd = dow(a.date);
      for (const uid of (a.user_ids || [])) {
        if (!validUsers.has(uid)) continue;
        const st = staffIndex.get(uid)!;
        // 二次校验硬约束
        if (st.blocked_shifts.includes(a.shift_code)) continue;
        if (st.blocked_weekdays.includes(wd)) continue;
        if (st.day_offs.includes(a.date)) continue;
        if (!st.available_weekdays.includes(wd)) continue;
        rows.push({ work_date: a.date, shift_code: a.shift_code, user_id: uid, source: 'ai', shop_id: shopId, created_by: userData.user.id });
      }
    }

    const seen = new Set<string>();
    const dedup = rows.filter(r => {
      const k = `${r.work_date}_${r.user_id}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    if (dedup.length) {
      const { error } = await supabase.from('shift_schedules').upsert(dedup, { onConflict: 'work_date,user_id' });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, count: dedup.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('generate-schedule error', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
