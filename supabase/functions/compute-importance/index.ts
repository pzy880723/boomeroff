// 为 official_knowledge 批量计算 importance_score（0-100）
// 优先使用 Perplexity（如已连接），否则降级使用 Lovable AI Gateway 让 Gemini 估算
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface Item {
  id: string;
  name: string;
  ip_name: string | null;
  category: string;
  era: string | null;
}

async function scoreWithPerplexity(it: Item, key: string): Promise<number | null> {
  const query = `${it.name} ${it.ip_name ?? ''} 中古 收藏价值`.trim();
  try {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: '你是一位中古市场专家，根据互联网热度评估物品的收藏与认知度。' },
          {
            role: 'user',
            content: `请评估「${query}」在中文/日文互联网上的热度与收藏认知度，仅返回一个 0-100 的整数（越知名越高）。只回数字。`,
          },
        ],
        max_tokens: 8,
        temperature: 0.1,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const citations: unknown[] = data?.citations ?? [];
    const fromText = parseInt(content.replace(/[^0-9]/g, ''), 10);
    const base = Number.isFinite(fromText) ? Math.min(100, Math.max(0, fromText)) : 0;
    // 引用数加成（每条 +1，封顶 15）
    return Math.min(100, base + Math.min(15, citations.length));
  } catch {
    return null;
  }
}

async function scoreWithLovableAI(items: Item[], key: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const list = items
    .map((it, i) => `${i + 1}. ${it.name}${it.ip_name ? ` / ${it.ip_name}` : ''}${it.era ? ` (${it.era})` : ''}`)
    .join('\n');
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content:
            '你是中古市场（日本/欧洲老物件、瓷器、玩具、文具、香道等）资深买手。基于互联网知名度、收藏热度、品牌权重，为每个物品给出 0-100 的重要程度分数（越知名/越值得学习越高）。仅返回 JSON：{"scores":[{"i":1,"s":85}, ...]}',
        },
        { role: 'user', content: `请为以下 ${items.length} 项物品打分：\n${list}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });
  if (!resp.ok) return result;
  const data = await resp.json();
  try {
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
    for (const row of parsed.scores ?? []) {
      const idx = (row.i ?? 0) - 1;
      if (idx >= 0 && idx < items.length) {
        const s = Math.min(100, Math.max(0, Math.round(Number(row.s) || 0)));
        result.set(items[idx].id, s);
      }
    }
  } catch {
    // ignore
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const PERPLEXITY_KEY = Deno.env.get('PERPLEXITY_API_KEY');
  const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY');

  // 验证调用者是 admin
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: '未登录' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleRow) return json({ error: '需要管理员权限' }, 403);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(50, Math.max(1, Number(body.limit) || 30));
  const onlyMissing = body.onlyMissing !== false;

  // 取一批待处理条目
  let q = admin
    .from('official_knowledge')
    .select('id,name,ip_name,category,era,importance_score')
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (onlyMissing) q = q.eq('importance_score', 0);
  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const items = (rows ?? []) as Item[];
  if (items.length === 0) return json({ processed: 0, remaining: 0, source: 'none' });

  let scores = new Map<string, number>();
  let source = 'lovable-ai';

  if (PERPLEXITY_KEY) {
    source = 'perplexity';
    // 串行避免速率限制；最多 30 个，约 30s
    for (const it of items) {
      const s = await scoreWithPerplexity(it, PERPLEXITY_KEY);
      if (s !== null) scores.set(it.id, s);
    }
  } else if (LOVABLE_KEY) {
    scores = await scoreWithLovableAI(items, LOVABLE_KEY);
  } else {
    return json({ error: '未配置 Perplexity 或 Lovable AI Key' }, 500);
  }

  // 写回；至少给个 1，避免下一次又被当 0 重选
  let processed = 0;
  for (const it of items) {
    const s = scores.get(it.id) ?? 1;
    const { error: upErr } = await admin
      .from('official_knowledge')
      .update({ importance_score: s })
      .eq('id', it.id);
    if (!upErr) processed += 1;
  }

  // 还剩多少
  const { count } = await admin
    .from('official_knowledge')
    .select('id', { count: 'exact', head: true })
    .eq('importance_score', 0);

  return json({ processed, remaining: count ?? 0, source });
});
