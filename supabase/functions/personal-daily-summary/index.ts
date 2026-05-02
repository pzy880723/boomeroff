import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_LABELS: Record<string, string> = {
  jp_porcelain: '日瓷', eu_porcelain: '欧瓷', incense: '线香', antique_art: '古美术',
  local_craft: '本地特色', anime_toy: '动漫玩具', otaku_goods: '二次元周边', luxury: '奢侈品',
  vintage_jewelry: '中古首饰', game_console: '游戏机', walkman: '随身听', ccd: 'CCD',
  media_record: '音像制品', playback_device: '播放设备', home_appliance: '家用电器',
  hobby: '兴趣爱好', other: '其他', porcelain: '瓷器', stationery: '文房四宝',
  lacquerware: '漆器', bronze: '铜器', woodcraft: '木器', textile: '织物',
  jewelry: '首饰', painting: '书画',
};

function safeParseJSON(raw: string): any {
  if (!raw) return null;
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) txt = m[0];
  try { return JSON.parse(txt.replace(/,(\s*[}\]])/g, '$1')); } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: '登录已过期' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let force = false;
    try {
      const body = await req.json();
      if (body && typeof body === 'object' && body.force) force = true;
    } catch { /* ignore empty body */ }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `personal_daily:${user.id}:${today}`;

    if (!force) {
      const { data: cached } = await adminClient
        .from('app_settings').select('value').eq('key', cacheKey).maybeSingle();
      if (cached?.value) {
        return new Response(JSON.stringify(cached.value), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [shopRes, favRes, knowRes] = await Promise.all([
      adminClient.from('products')
        .select('name, category, era, origin')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false }).limit(40),
      adminClient.from('user_favorites')
        .select('source_type, snapshot, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(50),
      adminClient.from('product_knowledge')
        .select('product_name, category, era, origin, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false }).limit(50),
    ]);

    const shopProducts = shopRes.data || [];
    const shopCatCount: Record<string, number> = {};
    shopProducts.forEach((p: any) => {
      shopCatCount[p.category] = (shopCatCount[p.category] || 0) + 1;
    });
    const shopTopCats = Object.entries(shopCatCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([c, n]) => `${CATEGORY_LABELS[c] || c} ${n}件`).join('、');

    const myCatCount: Record<string, number> = {};
    (favRes.data || []).forEach((f: any) => {
      const c = f.snapshot?.category || 'other';
      myCatCount[c] = (myCatCount[c] || 0) + 1;
    });
    (knowRes.data || []).forEach((k: any) => {
      myCatCount[k.category] = (myCatCount[k.category] || 0) + 1;
    });
    const myTopCats = Object.entries(myCatCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([c, n]) => `${CATEGORY_LABELS[c] || c} ${n}条`).join('、');

    const totalShop = shopProducts.length;
    const totalMine = (favRes.data || []).length + (knowRes.data || []).length;

    let summary = { team_summary: '', personal_advice: '' };

    if (LOVABLE_API_KEY) {
      const prompt = `你是日本中古杂货店的资深店长，给一位店员做今日学习简报。
【全店最近 7 天】共识别 ${totalShop} 件商品。品类分布：${shopTopCats || '暂无'}。
【店员个人累计】共 ${totalMine} 条（${(favRes.data || []).length} 收藏 + ${(knowRes.data || []).length} 自建知识）。品类分布：${myTopCats || '暂无'}。

请输出 JSON：
{
  "team_summary": "≤60字，全店本周整体热点和需要重点关注的品类",
  "personal_advice": "≤50字，针对该店员个人收藏分布的一句具体建议（指出短板或推荐补哪一类）"
}
注意：用第二人称「你」称呼店员，不要写「主播」。只返回 JSON。`;

      try {
        const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              { role: 'system', content: '你是中古店长，简体中文回答，只输出 JSON。' },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
          }),
        });
        if (aiResp.ok) {
          const d = await aiResp.json();
          const parsed = safeParseJSON(d.choices?.[0]?.message?.content || '');
          if (parsed) {
            summary.team_summary = String(parsed.team_summary || '').slice(0, 80);
            summary.personal_advice = String(parsed.personal_advice || '').slice(0, 80);
          }
        } else {
          console.error('[PersonalSummary] AI status:', aiResp.status);
        }
      } catch (e) {
        console.error('[PersonalSummary] AI fetch error:', e);
      }
    }

    if (!summary.team_summary) {
      summary.team_summary = totalShop > 0
        ? `全店本周共识别 ${totalShop} 件商品，热门：${shopTopCats || '暂无'}`
        : '全店本周暂无新识别商品，多去拍照识别吧';
    }
    if (!summary.personal_advice) {
      summary.personal_advice = totalMine > 0
        ? `你的学习清单已有 ${totalMine} 条，集中在：${myTopCats || '少量品类'}`
        : '你还没收藏任何商品，去识别页或官方知识库收藏起来吧';
    }

    const payload = {
      summary,
      stats: {
        shop_total: totalShop,
        mine_total: totalMine,
        shop_top_cats: shopTopCats,
        my_top_cats: myTopCats,
      },
      generated_at: new Date().toISOString(),
    };

    await adminClient.from('app_settings').upsert(
      { key: cacheKey, value: payload, updated_by: user.id },
      { onConflict: 'key' },
    );

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[PersonalSummary] error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '生成失败' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
