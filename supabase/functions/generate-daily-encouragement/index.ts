import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACKS = [
  '今天也把每一位进店的客人当作朋友。',
  '一个微笑,能让今天的门店发光。',
  '慢一点,把每件商品讲清楚就够了。',
  '别急着卖,先听客人怎么说。',
  '你在的地方,就是门店的温度。',
];

function pickFallback() {
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

function todayShanghai(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, key);

  const date = todayShanghai();

  // 命中直接返回
  const { data: hit } = await admin
    .from('daily_encouragement')
    .select('text')
    .eq('date', date)
    .maybeSingle();
  if (hit?.text) {
    return new Response(JSON.stringify({ date, text: hit.text, cached: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // AI 生成
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  let text = pickFallback();
  if (apiKey) {
    try {
      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: '你是门店店员的一位温柔而有力量的伙伴,每天送出一句 12-22 字的中文鼓励。要具体、真诚、不要口号、不要 emoji、不要引号。' },
            { role: 'user', content: `今天是 ${date}, 给日式中古杂货店的店员一句今日鼓励。` },
          ],
          temperature: 1.0,
          max_tokens: 60,
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        const out = (j.choices?.[0]?.message?.content || '').trim().replace(/^["「『]+|["」』]+$/g, '');
        if (out && out.length <= 40) text = out;
      }
    } catch (_) { /* keep fallback */ }
  }

  await admin.from('daily_encouragement').upsert({ date, text }, { onConflict: 'date' });

  return new Response(JSON.stringify({ date, text, cached: false }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
