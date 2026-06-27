// 根据本次素材的品类/标签 + 店铺/节日,让 AI 动态生成一位最匹配的「探店博主」人设。
// 不走预设博主库 —— 瓷器→老克勒,潮玩→年轻女生,亲子→宝妈,户外→硬汉等都由 AI 现想。

export interface InfluencerPersona {
  label: string;          // 例:55岁老克勒大叔
  gender: 'male' | 'female' | 'any';
  age: number;
  visual: string;         // 外观锁:发型/穿着/气质,30-80 字
  vibe: string;           // 说话风格 + 节奏,20-60 字
  opener: string;         // 开场招呼语,≤8 字
  catchphrase: string[];  // 口头禅 2-3 条,每条 ≤10 字
  cta: string;            // 收尾呼吁,≤10 字
}

const FALLBACK_PERSONA: InfluencerPersona = {
  label: '25 岁年轻女生探店博主',
  gender: 'female',
  age: 25,
  visual: '齐肩短发、明亮妆容、oversize 卫衣,活泼自然,镜头感强',
  vibe: '高能口播,语速适中,带点撒娇式安利',
  opener: '姐妹些!',
  catchphrase: ['绝绝子', '巨好出片', '闭眼冲'],
  cta: '地址放评论区',
};

function pickStrings(v: any, max = 3): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max);
}

export async function generatePersona(opts: {
  assetTags: string[];
  assetCategories: string[];
  shopName?: string | null;
  shopCategory?: string | null;
  holidayName?: string | null;
}): Promise<InfluencerPersona> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return FALLBACK_PERSONA;

  const tagsLine = Array.from(new Set([...(opts.assetCategories || []), ...(opts.assetTags || [])]))
    .filter(Boolean).slice(0, 20).join('、');

  const sys = `你是短视频导演,要为一条 15 秒小红书/抖音「探店」口播视频挑一位最合适的探店博主。
博主必须是虚构人物(禁止使用真人姓名/明星名),性别/年龄/穿着/语言风格都要跟店里在卖的品类强匹配:
- 古董/瓷器/老物件/文玩/旗袍 → 中老年男性「老克勒」或文气阿姨,慢条斯理。
- 潮玩/盲盒/二次元/谷子/动漫周边 → 年轻女生或大学生男生,活泼跳脱。
- 母婴/玩具/亲子/绘本 → 30 岁宝妈,温柔有耐心。
- 户外/运动/装备/工具 → 30-40 岁硬汉,声音低沉。
- 美妆/穿搭/首饰/包包 → 25 岁时髦女生,精致。
- 食品/餐饮/烘焙/咖啡 → 吃货大叔或大学女生,声音夸张。
- 男装/球鞋/潮牌 → 25 岁阳光帅哥。
- 不确定品类 → 25 岁年轻女生兜底。
- 节日临近时,人设语气可贴节日气氛。`;

  const usr = `店铺:${opts.shopName || '本店'}${opts.shopCategory ? ` · ${opts.shopCategory}` : ''}
本次素材品类/标签:${tagsLine || '(无)'}
${opts.holidayName ? `临近节日:${opts.holidayName}` : ''}

请输出严格 JSON(全部简体中文,不要 markdown):
{
  "label": "<例:55岁老克勒大叔 / 22岁潮玩女生>",
  "gender": "male" | "female",
  "age": <整数>,
  "visual": "<30-80字外观:发色/发型/穿着/气质,要让模型能照画>",
  "vibe": "<20-60字说话节奏与风格>",
  "opener": "<开场招呼≤8字>",
  "catchphrase": ["<口头禅1>","<口头禅2>","<口头禅3>"],
  "cta": "<收尾呼吁≤10字>"
}`;

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        temperature: 0.9,
      }),
    });
    if (!res.ok) {
      console.warn('[persona] AI', res.status);
      return FALLBACK_PERSONA;
    }
    const data = await res.json();
    let raw: string = (data?.choices?.[0]?.message?.content || '').toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    const parsed = JSON.parse(raw);

    const persona: InfluencerPersona = {
      label: String(parsed.label || '').trim().slice(0, 40) || FALLBACK_PERSONA.label,
      gender: parsed.gender === 'male' ? 'male' : parsed.gender === 'female' ? 'female' : 'any',
      age: Math.max(15, Math.min(80, parseInt(parsed.age) || FALLBACK_PERSONA.age)),
      visual: String(parsed.visual || '').trim().slice(0, 120) || FALLBACK_PERSONA.visual,
      vibe: String(parsed.vibe || '').trim().slice(0, 80) || FALLBACK_PERSONA.vibe,
      opener: String(parsed.opener || '').trim().slice(0, 10) || FALLBACK_PERSONA.opener,
      catchphrase: (pickStrings(parsed.catchphrase, 3).map((s) => s.slice(0, 12))).length
        ? pickStrings(parsed.catchphrase, 3).map((s) => s.slice(0, 12))
        : FALLBACK_PERSONA.catchphrase,
      cta: String(parsed.cta || '').trim().slice(0, 12) || FALLBACK_PERSONA.cta,
    };
    return persona;
  } catch (e) {
    console.warn('[persona] parse fail', e);
    return FALLBACK_PERSONA;
  }
}

// 拼成 Seedance Prompt 强约束(主角虚构博主,不绑参考图)
export function formatPersonaDirective(p: InfluencerPersona): string {
  const g = p.gender === 'male' ? '男性' : p.gender === 'female' ? '女性' : '';
  return `Lead character (virtual influencer, NOT a real celebrity): ${p.label} · ${g} · age ${p.age}. Appearance lock: ${p.visual}. Speaks Mandarin Chinese in this vibe: ${p.vibe}. Same person, same hair, same outfit across every shot. No twins, no body doubles, no swap.`;
}

// 拼成脚本 brief 里给 generate-marketing-video-script 用的中文段
export function formatPersonaBriefZh(p: InfluencerPersona): string {
  return `【本片探店博主(虚构人设,全片唯一主角)】
- 人设:${p.label}
- 外观锁(每镜同一人):${p.visual}
- 说话风格:${p.vibe}
- 开场招呼(可改写不要照抄):${p.opener}
- 口头禅池(可挑可改):${p.catchphrase.join(' / ')}
- 收尾 CTA(可改写):${p.cta}
台词必须用第一人称(我/姐妹/家人们/老铁),把自己当成跑来这家店打卡的探店博主,而不是店员或老板。`;
}
