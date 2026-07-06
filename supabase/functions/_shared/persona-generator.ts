// 根据本次素材的品类/标签 + 店铺/节日,让 AI 动态生成一位最匹配的「探店博主」人设。
// 关键设计:
//   1) 调 AI 前先本地随机抽 { ageBucket, groupType }(按品类加权),把年龄段/组合形式硬塞进 prompt
//      以保证真正随机 —— 老人、中年、年轻、情侣、一家三口 都会出现。
//   2) 外观和面部质感都用"反 AI 感"硬约束,追求真人 vlog 感,禁止塑料脸/奇装异服。

export type PersonaPace = 'medium' | 'fast';
export type AgeBucket = 'young' | 'middle' | 'senior';
export type GroupType = 'solo' | 'couple' | 'family';

export interface PersonaCompanion {
  role: string;   // 例:女友、丈夫、儿子(6 岁)
  visual: string; // 30-80 字外观
}

export interface InfluencerPersona {
  label: string;
  gender: 'male' | 'female' | 'any';
  age: number;
  visual: string;
  vibe: string;
  pace: PersonaPace;
  tone_label: string;
  opener: string;
  catchphrase: string[];
  cta: string;
  group_type?: GroupType;
  age_bucket?: AgeBucket;
  companions?: PersonaCompanion[];
}

// ---------- 随机抽样 ----------

interface CategoryWeights {
  keywords: string[];
  age: [number, number, number]; // young / middle / senior
  familyBoost?: number;          // family 组合的加成
}

const CATEGORY_TABLE: CategoryWeights[] = [
  { keywords: ['瓷器', '古董', '文玩', '字画', '旗袍', '茶器', '茶具', '老物件', '古玩', '收藏'], age: [5, 30, 65] },
  { keywords: ['玩具', '潮玩', '盲盒', '谷子', '动漫', '二次元', '手办', '模型'], age: [65, 25, 10] },
  { keywords: ['母婴', '亲子', '绘本', '童装', '婴儿', '儿童'], age: [25, 60, 15], familyBoost: 30 },
  { keywords: ['美妆', '首饰', '包包', '穿搭', '潮牌', '球鞋', '彩妆', '香水'], age: [60, 30, 10] },
  { keywords: ['家居', '咖啡器具', '原木', '北欧', '家具', '灯具'], age: [35, 50, 15] },
  { keywords: ['户外', '运动', '装备', '工具', '露营', '钓鱼'], age: [25, 55, 20] },
  { keywords: ['食品', '餐饮', '烘焙', '小吃', '甜品', '零食'], age: [40, 40, 20] },
];

const DEFAULT_AGE_WEIGHTS: [number, number, number] = [40, 35, 25];

// 各年龄段真实会讲 / 绝对不会讲的场景话题,喂给脚本 AI 和 persona AI,防止老头子讲"暑假来逛"
const AGE_TOPIC_HINTS: Record<AgeBucket, { ok: string; ban: string }> = {
  young: {
    ok: '暑假/寒假/开学/周末逛街/追星/入坑/打卡/攒钱买/上班摸鱼/情人节/闺蜜安利',
    ban: '退休/含饴弄孙/老伴/年轻时候/我们那年代/接孙子',
  },
  middle: {
    ok: '下班顺路/带娃/接孩子放学/周末陪家人/送礼/孝敬爸妈/给老公老婆挑/顺路遛弯',
    ban: '暑假作业/开学季/追星/入坑二次元/退休金/摸鱼',
  },
  senior: {
    ok: '退休了多出来走走/接孙子放学路上/老伙计聚会/给孙辈挑个小玩意/年轻时候就喜欢/怀旧/老邻居推荐',
    ban: '暑假/寒假/开学/追星/入坑/打卡/摸鱼/上班/加班',
  },
};

function ageBucketZhShort(b: AgeBucket): string {
  return b === 'senior' ? '老年人' : b === 'middle' ? '中年人' : '年轻人';
}

function weightedPick<T>(items: { item: T; w: number }[]): T {
  const total = items.reduce((s, x) => s + Math.max(0, x.w), 0);
  if (total <= 0) return items[0].item;
  let r = Math.random() * total;
  for (const x of items) {
    r -= Math.max(0, x.w);
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

function pickPersonaSlot(assetTags: string[], assetCategories: string[]): {
  ageBucket: AgeBucket;
  age: number;
  groupType: GroupType;
} {
  const all = [...(assetCategories || []), ...(assetTags || [])].map((s) => String(s || ''));
  const joined = all.join(' ');

  let ageW = DEFAULT_AGE_WEIGHTS;
  let familyBoost = 0;
  for (const row of CATEGORY_TABLE) {
    if (row.keywords.some((k) => joined.includes(k))) {
      ageW = row.age;
      if (row.familyBoost) familyBoost = row.familyBoost;
      break;
    }
  }

  const ageBucket = weightedPick<AgeBucket>([
    { item: 'young', w: ageW[0] },
    { item: 'middle', w: ageW[1] },
    { item: 'senior', w: ageW[2] },
  ]);

  const ranges: Record<AgeBucket, [number, number]> = {
    young: [18, 32], middle: [35, 52], senior: [58, 72],
  };
  const [lo, hi] = ranges[ageBucket];
  const age = lo + Math.floor(Math.random() * (hi - lo + 1));

  const groupType = weightedPick<GroupType>([
    { item: 'solo', w: 65 },
    { item: 'couple', w: 20 },
    { item: 'family', w: 15 + familyBoost },
  ]);

  return { ageBucket, age, groupType };
}

// ---------- Fallback 池 ----------

const FALLBACK_POOL: InfluencerPersona[] = [
  {
    label: '25 岁邻家女生探店博主',
    gender: 'female', age: 25,
    visual: '齐肩自然发色短发有碎发，皮肤有真实毛孔和淡淡雀斑，日常白 T + 牛仔外套，妆感很淡，看起来就是普通女生',
    vibe: '语速快，热情自然，带真情实感的安利',
    pace: 'fast', tone_label: '真诚种草',
    opener: '姐妹些！', catchphrase: ['真的可以', '闭眼冲', '巨值'], cta: '地址评论区',
    group_type: 'solo',
  },
  {
    label: '42 岁家居主理人大叔',
    gender: 'male', age: 42,
    visual: '花白鬓角短发，脸上有法令纹和淡淡胡茬，黑框眼镜，深灰针织 + 卡其休闲裤，气质沉稳但会突然兴奋',
    vibe: '中速，稳中带劲，像跟朋友分享刚淘到的宝贝',
    pace: 'medium', tone_label: '沉稳掏宝',
    opener: '兄弟们！', catchphrase: ['真的绝', '看这个手感', '性价比爆炸'], cta: '一定要来看看',
    group_type: 'solo',
  },
  {
    label: '65 岁老克勒大叔',
    gender: 'male', age: 65,
    visual: '花白背头、眼角深皱纹、颈部有真实老年皮肤纹理，藏青polo衫加薄外套，戴金属细框眼镜，手上有老年斑',
    vibe: '中速，稳但带情绪起伏，看到宝贝会突然提高音量惊呼',
    pace: 'medium', tone_label: '老克勒安利',
    opener: '侬看看！', catchphrase: ['老适宜额', '这个真的老好', '值当'], cta: '有空来白相',
    group_type: 'solo',
  },
  {
    label: '35 岁宝妈',
    gender: 'female', age: 35,
    visual: '扎马尾自然黑发有碎发，皮肤有真实肌理和淡淡眼周细纹，米白毛衣 + 浅色阔腿裤，妆容清淡',
    vibe: '中速偏快，像跟闺蜜安利刚遛娃发现的宝店',
    pace: 'medium', tone_label: '宝妈狂喜',
    opener: '姐妹！', catchphrase: ['遛娃神店', '真的省心', '娃超爱'], cta: '带娃冲',
    group_type: 'solo',
  },
];

function fallbackPersona(slot?: { ageBucket: AgeBucket; groupType: GroupType }): InfluencerPersona {
  if (!slot) {
    const pick = FALLBACK_POOL[Math.floor(Math.random() * FALLBACK_POOL.length)];
    return { ...pick };
  }
  // 按年龄段挑最接近的一个
  const targetAge = slot.ageBucket === 'senior' ? 65 : slot.ageBucket === 'middle' ? 42 : 25;
  const sorted = [...FALLBACK_POOL].sort((a, b) => Math.abs(a.age - targetAge) - Math.abs(b.age - targetAge));
  return { ...sorted[0], group_type: slot.groupType, age_bucket: slot.ageBucket };
}

// ---------- 主流程 ----------

function pickStrings(v: any, max = 3): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max);
}

function normPace(v: any): PersonaPace {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'fast') return 'fast';
  return 'medium';
}

function parseCompanions(v: any): PersonaCompanion[] {
  if (!Array.isArray(v)) return [];
  return v.map((c) => ({
    role: String(c?.role || '').trim().slice(0, 20),
    visual: String(c?.visual || '').trim().slice(0, 160),
  })).filter((c) => c.role && c.visual).slice(0, 3);
}

export async function generatePersona(opts: {
  assetTags: string[];
  assetCategories: string[];
  shopName?: string | null;
  shopCategory?: string | null;
  holidayName?: string | null;
}): Promise<InfluencerPersona> {
  const slot = pickPersonaSlot(opts.assetTags || [], opts.assetCategories || []);

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return fallbackPersona(slot);

  const tagsLine = Array.from(new Set([...(opts.assetCategories || []), ...(opts.assetTags || [])]))
    .filter(Boolean).slice(0, 20).join('、');

  const ageBucketZh = slot.ageBucket === 'senior' ? '老年(58-72 岁)'
    : slot.ageBucket === 'middle' ? '中年(35-52 岁)' : '青年(18-32 岁)';
  const groupZh = slot.groupType === 'family' ? '一家三口(爸+妈+孩子,或母子/父女档,自然互动)'
    : slot.groupType === 'couple' ? '情侣或闺蜜档(2 人一起探店,风格协调)'
    : '单人博主';

  const sys = `你是短视频导演,要为一条 15 秒小红书/抖音「探店」口播视频写一位最合适的探店博主人设。
博主是虚构人物(禁止真人姓名/明星名)。

【本次已经预先抽好角色档案槽位,严格照做,禁止改年龄段/组合形式】
- 年龄段: ${ageBucketZh},具体年龄必须是 ${slot.age} 岁
- 组合形式: ${slot.groupType} → ${groupZh}
品类只用来指引气质/口头禅/穿着风格,不允许你改回"25 岁年轻女生"这种默认套路。

【硬规则 · 节奏】pace 只能是 "medium" 或 "fast"(没有 slow)。
所有博主至少 medium energy,严禁 slow / 优雅 / 端着 / 慢条斯理 / 留白 / PPT 感 / 平铺直叙。
即使是老克勒、主理人这种沉稳人设,也要有情绪起伏,会突然提高音量惊呼,不是茶艺师讲解。
vibe / tone_label / catchphrase / opener / cta 全部禁止出现:优雅、calm、refined、elegant、慢条斯理、娓娓道来、岁月静好、留白、禅意、淡然、安静。

【外观 · 硬约束】
- 都要写成"街上真能看到的普通人":合身日常穿搭(T 恤、衬衫、针织、外套、牛仔裤、休闲裙、旗袍等),中性/低饱和配色。
- 严禁:cosplay、二次元造型、夸张假发、亮片、荧光色、汉服写真、舞台服、艺术家浮夸装扮、oversize 到滑稽。
- senior 必须像真正的中老年人:自然银发或花白发,眼角/额头有真实细纹,颈部与手部有年龄痕迹,体态自然不僵。禁止"少女感奶奶"。
- couple/family:必须在 companions 里各自单独写外观,风格互相协调(不要一个潮牌一个正装)。

【面部质感 · 反 AI 感硬约束】(所有出现的人物,visual 字段末尾都必须带进去)
- 皮肤要有真实肌理:可见毛孔、细小绒毛、皮脂反光不均匀、局部小瑕疵(斑点/痘印/晒纹/唇纹)。
- 眼睛要有真实高光和虹膜纹理,眼白略带血丝,不完全对称。
- 头发要有碎发、飞毛、发根颜色深浅过渡,不是一体成型的假发。
- 光线是自然商场/室内混合光,略带阴影,不是柔化磨皮打光。
- 严禁:磨皮塑料感、糖水片美颜、瞳孔完全对称、CGI 般光滑肌肤、无毛孔陶瓷脸、双胞胎脸、AI 通用美女/帅哥脸模、身体比例失真。

【口播话题 · 必须符合角色年龄】opener / catchphrase / cta 必须是 ${slot.age} 岁 ${ageBucketZhShort(slot.ageBucket)} 真实会讲的话。
- 推荐话题:${AGE_TOPIC_HINTS[slot.ageBucket].ok}
- 严禁话题:${AGE_TOPIC_HINTS[slot.ageBucket].ban}
- senior 严禁"暑假/开学/追星/入坑/摸鱼",要讲"退休了多出来走走""接孙子路上顺道进来""老伙计推荐的""年轻时候就喜欢"。
- young 讲暑假、周末逛街、追星、打卡;middle 讲下班顺路、带娃、送礼、孝敬爸妈。
- couple/family 里若有老人,老人只讲老人话题;孩子/暑假话题由年轻或中年成员讲。

节日临近时,人设语气可贴节日气氛,但节奏仍至少 medium。`;

  const usr = `店铺:${opts.shopName || '本店'}${opts.shopCategory ? ` · ${opts.shopCategory}` : ''}
本次素材品类/标签:${tagsLine || '(无)'}
${opts.holidayName ? `临近节日:${opts.holidayName}` : ''}

请输出严格 JSON(简体中文,不要 markdown):
{
  "label": "<例:65岁老克勒大叔 / 42岁家居主理人 / 30岁宝妈带6岁女儿>",
  "gender": "male" | "female",
  "age": ${slot.age},
  "visual": "<40-100字外观:发色/发型/穿着/气质 + 结尾追加真实面部肌理描述>",
  "vibe": "<20-60字说话节奏与风格,跟 pace 一致>",
  "pace": "medium" | "fast",
  "tone_label": "<≤8字风格短标签,例:沉稳掏宝 / 高能种草 / 老克勒安利>",
  "opener": "<开场招呼≤8字>",
  "catchphrase": ["<口头禅1>","<口头禅2>","<口头禅3>"],
  "cta": "<收尾呼吁≤10字>",
  "group_type": "${slot.groupType}",
  "companions": ${slot.groupType === 'solo' ? '[]' : '[{"role":"<例:女友/丈夫/6岁儿子>","visual":"<40-100字外观,同样带真实肌理约束>"}]'}
}`;

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        temperature: 0.95,
      }),
    });
    if (!res.ok) {
      console.warn('[persona] AI', res.status);
      return fallbackPersona(slot);
    }
    const data = await res.json();
    let raw: string = (data?.choices?.[0]?.message?.content || '').toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    const parsed = JSON.parse(raw);

    const fb = fallbackPersona(slot);
    const cps = pickStrings(parsed.catchphrase, 3).map((s) => s.slice(0, 12));
    const persona: InfluencerPersona = {
      label: String(parsed.label || '').trim().slice(0, 40) || fb.label,
      gender: parsed.gender === 'male' ? 'male' : parsed.gender === 'female' ? 'female' : 'any',
      // 强制回到本次抽好的年龄,防止 AI 偷偷改回年轻
      age: slot.age,
      visual: String(parsed.visual || '').trim().slice(0, 200) || fb.visual,
      vibe: String(parsed.vibe || '').trim().slice(0, 80) || fb.vibe,
      pace: normPace(parsed.pace),
      tone_label: String(parsed.tone_label || '').trim().slice(0, 12) || fb.tone_label,
      opener: String(parsed.opener || '').trim().slice(0, 10) || fb.opener,
      catchphrase: cps.length ? cps : fb.catchphrase,
      cta: String(parsed.cta || '').trim().slice(0, 12) || fb.cta,
      group_type: slot.groupType,
      age_bucket: slot.ageBucket,
      companions: slot.groupType === 'solo' ? [] : parseCompanions(parsed.companions),
    };
    return persona;
  } catch (e) {
    console.warn('[persona] parse fail', e);
    return fallbackPersona(slot);
  }
}

// ---------- Prompt 拼接 ----------

function paceEn(p: PersonaPace): string {
  if (p === 'fast') return 'high-energy, rapid delivery; punchy fast cuts; brisk hand-held camera; expressive, enthusiastic tone with strong emotional peaks';
  return 'natural conversational pace with clear energy and enthusiasm; steady but lively camera moves; expressive delivery with emotional ups and downs, never flat or calm';
}

function paceZh(p: PersonaPace): string {
  if (p === 'fast') return '快节奏 · 高能 · 短句快剪,情绪饱满';
  return '中速 · 带情绪 · 有起伏 · 不平铺直叙,稳但有推进感,会突然惊喜会用力安利';
}

const REALISM_LOCK_EN =
  'CRITICAL REALISM LOCK: Photorealistic real human, documentary-style handheld phone footage. ' +
  'Skin must show natural imperfect texture — visible pores, fine facial hair (peach fuzz), subtle blemishes, uneven skin tone, natural under-eye shadow, faint lines and expression wrinkles appropriate to age. ' +
  'Realistic hair with flyaways, darker roots, natural strand separation (not a molded wig). ' +
  'Real iris texture with asymmetric catchlights, slightly bloodshot sclera, imperfect eye symmetry. ' +
  'Indoor mall mixed lighting with soft ambient shadows on the face. ' +
  'ABSOLUTELY NOT: airbrushed / plastic skin / poreless CGI face / symmetric AI beauty face / doll-like eyes / over-smoothed / beauty-cam over-lit look / cartoon / anime / cosplay / stage costume / synthetic hair. ' +
  'The result must be indistinguishable from a real phone-shot vlog by an ordinary person.';

// 拼成 Seedance Prompt 强约束(主角虚构博主,不绑参考图)
export function formatPersonaDirective(p: InfluencerPersona): string {
  const g = p.gender === 'male' ? '男' : p.gender === 'female' ? '女' : '';
  const group = p.group_type || 'solo';
  const companions = (p.companions || []).filter((c) => c.role && c.visual);

  let lead = `Lead character (virtual influencer, NOT a real celebrity): ${p.label} · ${g} · age ${p.age}. Appearance lock: ${p.visual}. Speaks Mandarin Chinese in this vibe: ${p.vibe}. Overall pacing: ${paceEn(p.pace)}.`;

  if (group !== 'solo' && companions.length) {
    const compStr = companions.map((c) => `${c.role}: ${c.visual}`).join(' | ');
    const groupLabel = group === 'family' ? 'family group (2-3 people, natural family dynamic)' : 'duo (2 people together, natural chemistry)';
    lead += ` This is a ${groupLabel}. Companions (all fixed, same people every shot): ${compStr}. All members appear together consistently across every shot, no swapping, no extra people.`;
  } else {
    lead += ' Same person, same hair, same outfit across every shot. No twins, no body doubles, no swap.';
  }

  return `${lead} ${REALISM_LOCK_EN}`;
}

// 拼成脚本 brief 里给 generate-marketing-video-script 用的中文段
export function formatPersonaBriefZh(p: InfluencerPersona): string {
  const group = p.group_type || 'solo';
  const companions = (p.companions || []).filter((c) => c.role && c.visual);
  const groupLine = group === 'family'
    ? `【组合】一家 ${1 + companions.length} 口,全片同一组人自然互动`
    : group === 'couple'
      ? `【组合】${1 + companions.length} 人档,全片同一组人一起出镜`
      : `【组合】单人博主,全片唯一主角`;
  const compBlock = companions.length
    ? `\n- 同伴外观(每镜都要同人):\n${companions.map((c) => `  · ${c.role}:${c.visual}`).join('\n')}`
    : '';

  return `【本片探店主角(虚构人设)】
${groupLine}
- 主角:${p.label}(${p.age} 岁)
- 风格:${p.tone_label}(${paceZh(p.pace)})
- 主角外观锁(每镜同一人,含真实肌理):${p.visual}${compBlock}
- 说话风格:${p.vibe}
- 开场招呼(可改写不要照抄):${p.opener}
- 口头禅池(可挑可改,必须贴合风格):${p.catchphrase.join(' / ')}
- 收尾 CTA(可改写):${p.cta}
台词第一人称,把自己(和同伴)当成跑来这家店打卡的探店博主,不是店员或老板。
【真实感锁】所有出镜人物必须是真实感自然人:皮肤有毛孔、绒毛、瑕疵、光线不完美;头发有碎发飞毛;眼睛有真实高光。禁止磨皮塑料脸、AI 美人脸、cosplay、舞台服、双胞胎脸。目标:让观众完全看不出是 AI 做的,像真人手机 vlog。`;
}
