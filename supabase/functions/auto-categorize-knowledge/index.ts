import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VALID_CATEGORIES = [
  'jp_porcelain', 'eu_porcelain', 'incense', 'antique_art', 'local_craft',
  'anime_toy', 'otaku_goods', 'luxury', 'vintage_jewelry',
  'game_console', 'walkman', 'ccd', 'media_record', 'playback_device',
  'home_appliance', 'hobby', 'other',
] as const;

const CATEGORY_HINT = `品类参考：
- jp_porcelain 日瓷（有田/九谷/京烧/香兰社等）
- eu_porcelain 欧瓷（Wedgwood/Meissen/Royal Copenhagen 等）
- incense 线香、香道用品
- antique_art 古美术（书画、漆器、铜器、木器、织物等老物件）
- local_craft 本地特色手作（南部铁器、京友禅、江户切子等）
- anime_toy 动漫玩具（高达、圣斗士、假面骑士、食玩、怪兽）
- otaku_goods 二次元周边（手办、景品、徽章、挂件、同人）
- luxury 奢侈品（包袋、服饰、配饰、腕表）
- vintage_jewelry 中古首饰（项链/戒指/胸针/耳饰/手链）
- game_console 游戏机、卡带、掌机
- walkman 随身听 / Discman / MD
- ccd CCD 数码相机
- media_record 音像制品（黑胶/磁带/CD/DVD）
- playback_device 播放设备（黑胶机/卡带机/CD 机/收音机）
- home_appliance 家用电器（电视/收音/厨电/灯具）
- hobby 兴趣爱好（文具/香水/烟具/户外）
- other 实在归不进去的`;

// 与前端 src/types/index.ts 保持一致
const CATEGORY_BRANDS: Record<string, string[]> = {
  jp_porcelain: ['香兰社', '大仓陶园', '深川制磁', '九谷烧', '萨摩烧', '有田烧', '京烧', '清水烧', '伊万里', 'Noritake', 'Narumi'],
  eu_porcelain: ['Wedgwood', 'Meissen', 'Royal Copenhagen', 'Herend', 'Limoges', 'Royal Albert', 'Royal Doulton', 'Villeroy & Boch'],
  incense: ['鸠居堂', '松栄堂', '日本香堂', '山田松香木店', '香十', '玉初堂'],
  antique_art: [],
  local_craft: ['南部铁器', '京友禅', '江户切子', '津轻涂', '博多织', '九谷', '輪島涂'],
  anime_toy: ['Bandai', 'Popy', 'Medicom', 'Sanrio 三丽鸥', 'Takara Tomy', '万代'],
  otaku_goods: [],
  luxury: ['Hermès', 'Chanel', 'Louis Vuitton', 'Cartier', 'Rolex', 'Gucci', 'Prada', 'Dior'],
  vintage_jewelry: ['Tiffany', 'Cartier', 'Mikimoto', 'Cameo', 'Bvlgari', 'Van Cleef & Arpels'],
  game_console: ['任天堂', '索尼', '世嘉', 'Atari', 'Microsoft'],
  walkman: ['索尼', '爱华', '松下', 'Panasonic', 'Sharp'],
  ccd: ['索尼', '佳能', '卡西欧', '富士', '奥林巴斯', '尼康', '理光', '柯达'],
  media_record: [],
  playback_device: ['JBL', 'Diatone', '山水', '先锋', 'Marantz', 'Denon', 'Technics', 'Bose'],
  home_appliance: ['National', 'Panasonic', 'Sharp', '日立', '东芝', '三洋'],
  hobby: [],
  other: [],
};

const CATEGORY_TYPES: Record<string, string[]> = {
  jp_porcelain: ['品牌窑口', '工艺技法', '器型用途', '花纹寓意', '年代鉴定', '场景搭配'],
  eu_porcelain: ['茶具', '餐具', '装饰瓷', '人物瓷偶', '花瓶'],
  incense: ['线香', '盘香', '锥香', '香道具', '香炉'],
  antique_art: ['书画', '漆器', '铜器', '木器', '织物', '浮世绘', '根付', '香炉', '茶道具'],
  local_craft: ['铁器', '染织', '玻璃', '漆器', '陶瓷'],
  anime_toy: ['高达', '圣斗士', '假面骑士', '战队', '怪兽', '食玩', 'Bearbrick', '龙珠', '阿童木', '变形金刚'],
  otaku_goods: ['手办', '景品', '吧唧', '亚克力立牌', '痛包', '原画集', '挂件', '徽章'],
  luxury: ['包袋', '服饰', '配饰', '腕表', '丝巾', '皮具'],
  vintage_jewelry: ['项链', '戒指', '胸针', '耳饰', '手链', '带留'],
  game_console: ['主机', '掌机', '卡带', '配件', '光盘'],
  walkman: ['Walkman 磁带', 'Discman', 'MD', '数码'],
  ccd: [],
  media_record: ['黑胶', '磁带', 'CD', 'DVD', 'LD'],
  playback_device: ['黑胶机', '卡带机', 'CD 机', '收音机', '音箱', '功放'],
  home_appliance: ['电视', '收音机', '厨电', '灯具', '风扇'],
  hobby: ['文具', '香水', '烟具', '户外', '钢笔', '打火机'],
  other: [],
};

const SYSTEM = `你是一名中古杂货店分类助手。根据用户给出的商品名称、IP/品牌、简介、卖点、年代，判断该词条最合适的一级品类编码、品牌、以及类型/题材。
${CATEGORY_HINT}

规则：
1. category 只能从给定编码中选一个，禁止编造。
2. 旧分类（porcelain/jewelry/stationery 等）一律重新映射到新编码。
3. brand：必须从该 category 的"品牌候选清单"中精确选一个；不在清单且实在重要时可返回新名（要写成中文规范名）；无品牌则返回 null。
4. sub_type：必须从该 category 的"类型候选清单"中精确选一个；找不到合适项就返回 null。
5. 同义合并：所有"Sony / 索尼 / SONY / ソニー"统一返回"索尼"；"任天堂 (Nintendo)"返回"任天堂"；"Hermès / 爱马仕"统一返回"Hermès"。优先用候选清单里出现的写法。
6. 不确定就返回 other 或 null，宁缺毋滥。`;

function buildPrompt(item: Record<string, unknown>): string {
  const lines: string[] = [];
  if (item.name) lines.push(`名称：${item.name}`);
  if (item.ip_name) lines.push(`原 IP/品牌字段：${item.ip_name}`);
  if (item.brand) lines.push(`原品牌字段：${item.brand}`);
  if (item.sub_type) lines.push(`原类型字段：${item.sub_type}`);
  if (item.summary) lines.push(`简介：${item.summary}`);
  if (item.era) lines.push(`年代：${item.era}`);
  if (item.origin) lines.push(`产地：${item.origin}`);
  const sp = Array.isArray(item.selling_points) ? item.selling_points : [];
  if (sp.length) {
    const text = sp.map((p: any) => (typeof p === 'string' ? p : p?.text || p?.tag || '')).filter(Boolean).slice(0, 5).join('；');
    if (text) lines.push(`卖点：${text}`);
  }
  if (item.tips) lines.push(`贴士：${String(item.tips).slice(0, 80)}`);
  if (item.hint_category) {
    const cat = String(item.hint_category);
    lines.push(`\n当前一级品类：${cat}`);
    const brands = CATEGORY_BRANDS[cat] || [];
    const types = CATEGORY_TYPES[cat] || [];
    if (brands.length) lines.push(`品牌候选：${brands.join(' / ')}`);
    if (types.length) lines.push(`类型候选：${types.join(' / ')}`);
  }
  return lines.join('\n');
}

async function callAI(prompt: string, apiKey: string, knownCategory?: string): Promise<{ category: string; brand: string | null; sub_type: string | null }> {
  // 若已知 category，约束 brand/sub_type 的枚举到该清单
  const brandList = knownCategory ? CATEGORY_BRANDS[knownCategory] || [] : [];
  const typeList = knownCategory ? CATEGORY_TYPES[knownCategory] || [] : [];

  const params: any = {
    type: 'object',
    properties: {
      category: { type: 'string', enum: [...VALID_CATEGORIES] },
      brand: { type: ['string', 'null'], description: '品牌/IP/窑口名，从候选清单精确选一个，无则 null' },
      sub_type: { type: ['string', 'null'], description: '类型/题材/工艺，从候选清单精确选一个，无则 null' },
      reason: { type: 'string', description: '一句话理由（中文，<30字）' },
    },
    required: ['category', 'brand', 'sub_type'],
    additionalProperties: false,
  };
  if (brandList.length) params.properties.brand.examples = brandList;
  if (typeList.length) params.properties.sub_type.examples = typeList;

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'set_category',
          description: '为该词条选择最合适的一级品类、品牌、类型',
          parameters: params,
        },
      }],
      tool_choice: { type: 'function', function: { name: 'set_category' } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('AI 未返回分类');
  const parsed = JSON.parse(args);
  const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
  return {
    category,
    brand: parsed.brand && String(parsed.brand).trim() ? String(parsed.brand).trim() : null,
    sub_type: parsed.sub_type && String(parsed.sub_type).trim() ? String(parsed.sub_type).trim() : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY 未配置');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'single';

    if (mode === 'single') {
      const item = {
        name: body.name,
        ip_name: body.ip_name,
        brand: body.brand,
        sub_type: body.sub_type,
        summary: body.summary,
        era: body.era,
        origin: body.origin,
        selling_points: body.selling_points,
        tips: body.tips,
        hint_category: body.category,
      };
      const result = await callAI(buildPrompt(item), apiKey, body.category);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // batch mode
    const target: 'official' | 'personal' | 'both' = body.target || 'both';
    const onlyEmpty: boolean = body.only_empty === true;
    const results = {
      official: { total: 0, updated: 0, failed: 0 },
      personal: { total: 0, updated: 0, failed: 0 },
    };

    if (target === 'official' || target === 'both') {
      const { data } = await supabase.from('official_knowledge')
        .select('id, name, ip_name, brand, sub_type, summary, era, origin, selling_points, tips, category');
      let list = (data || []) as any[];
      if (onlyEmpty) list = list.filter((it) => !it.brand || !it.sub_type);
      results.official.total = list.length;
      for (const it of list) {
        try {
          const r = await callAI(buildPrompt({ ...it, hint_category: it.category }), apiKey, it.category);
          const patch: any = {};
          if (r.category && r.category !== it.category) patch.category = r.category;
          if (r.brand !== it.brand) patch.brand = r.brand;
          if (r.sub_type !== it.sub_type) patch.sub_type = r.sub_type;
          // 同步更新 ip_name 为 brand 以便旧代码也能读
          if (r.brand && r.brand !== it.ip_name) patch.ip_name = r.brand;
          if (Object.keys(patch).length) {
            const { error } = await supabase.from('official_knowledge').update(patch).eq('id', it.id);
            if (error) throw error;
            results.official.updated++;
          }
        } catch (e) {
          results.official.failed++;
          console.error('official categorize fail', it.id, e);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (target === 'personal' || target === 'both') {
      const { data } = await supabase.from('product_knowledge')
        .select('id, product_name, category, brand, sub_type, era, origin, selling_points, tips');
      let list = (data || []) as any[];
      if (onlyEmpty) list = list.filter((it) => !it.brand || !it.sub_type);
      results.personal.total = list.length;
      for (const it of list) {
        try {
          const r = await callAI(buildPrompt({ ...it, name: it.product_name, hint_category: it.category }), apiKey, it.category);
          const patch: any = {};
          if (r.category && r.category !== it.category) patch.category = r.category;
          if (r.brand !== it.brand) patch.brand = r.brand;
          if (r.sub_type !== it.sub_type) patch.sub_type = r.sub_type;
          if (Object.keys(patch).length) {
            const { error } = await supabase.from('product_knowledge').update(patch).eq('id', it.id);
            if (error) throw error;
            results.personal.updated++;
          }
        } catch (e) {
          results.personal.failed++;
          console.error('personal categorize fail', it.id, e);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('auto-categorize-knowledge error', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
