// 营销中心共用的品牌上下文与预设加载器。改一处全改。
// 现在所有预设(品牌话术/平台描述/口吻描述/视频镜位规则)都可以由管理员在后台
// `营销预设` 中修改;edge function 会先读 marketing_presets 表,缺失项 fallback 到下面的默认常量。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const DEFAULT_BRAND_SYSTEM_PROMPT = `你正在为「BOOMER·OFF Vintage」做社交媒体内容。
品牌定位：国内首家标准化中古连锁品牌；平价、海量、标准化中古杂货铺；30,000+ SKU 高密度陈列。
覆盖时代：1950s–千禧年初。
核心调性：虽古但新 · 信任可见；创造情绪体验，而非推销。
顾客来这里寻找：稀缺性、沉浸感、治愈、翻筐乐。
品牌口号风格：克制、有质感、像随手记，不喊话。

文案铁律（违反任意一条都要重写）：
1. 100% 简体中文。品牌名 BOOMER·OFF / BOOMER 保留英文，其余英日韩词只在不可替代时出现。
2. 不编造价格、年代、产地、品牌、材质、稀有度。
3. 严禁出现："主播" "直播间" "保真" "真品" "保证升值" "秒杀" "限时抢" "全网最低" "拍卖行级别"。
4. 称呼用 "你" / "您" / "店员"，不用 "主播" / "宝宝们"。
5. 不写夸张违法宣传词。
6. 不写"全网首发""独家供应商"等无法核实的话。`;

// 兼容旧 import 名
export const BRAND_SYSTEM_PROMPT = DEFAULT_BRAND_SYSTEM_PROMPT;

export const DEFAULT_PLATFORM_BRIEF: Record<string, string> = {
  xhs: "小红书：标题 ≤20 字带钩子和 emoji，正文 150–220 字、分 3–4 短段，结尾留一句行动召唤；3–6 个 # 话题标签。",
  douyin: "抖音：标题 ≤20 字、口语化制造悬念；正文 80–140 字偏口播稿，分句短、便于读字幕；2–5 个 # 话题。",
  shipinhao: "视频号：标题 ≤22 字稳一点，正文 100–180 字克制有质感，2–4 个 # 话题。",
  pyq: "朋友圈：不要标题，只输出 1–3 段短文，几乎不用 emoji，像随手记，结尾不喊话；不要 # 话题。",
};

export const DEFAULT_TONE_BRIEF: Record<string, string> = {
  种草: "用第一人称'我'，描述偶遇/被打中的感觉，不写商品介绍。",
  治愈: "慢节奏第一人称，写一个安静的瞬间，色彩柔，留白多。",
  怀旧: "第一人称回忆口吻，由一件物件勾出一段年代记忆。",
  偶遇: "用现在进行时写当下，像在和朋友说'我刚刚看到了什么'。",
  探店: "用第一人称'我'，写从进店到翻筐的过程感，强调店里东西多/有意思。",
  翻筐日记: "日记体，写翻筐过程中的几件小发现，碎片化短句。",
  主理人手记: "店主口吻，半私人半专业，讲为什么收这件、放在哪里。",
  顾客来信: "假托一位顾客的口吻，写她/他在店里被打中的瞬间。",
  藏家分享: "半专业口吻，先点物件名/品牌/年代/工艺（仅限提供的事实），再讲为什么动心。",
  年代考据: "克制专业，讲这件东西所在年代的背景、流行原因（仅基于事实）。",
  工艺解读: "聚焦做工细节，讲材质/工艺/印记是怎么回事（仅基于事实）。",
  上新: "第三人称店铺口吻，告诉粉丝新到了什么类型的一件好物，不夸张。",
  限定到店: "短促口吻，告诉粉丝这是少量到店的款，希望来店看实物。",
};

// 视频类型的镜位规则
export type VideoType = 'store_tour' | 'product_showcase' | 'store_ambience' | 'new_arrival';

export interface ShotRule {
  label: string;
  required: { slot: string; label: string; minCount: number; hint: string }[];
  recommended: { slot: string; label: string; hint: string }[];
  scriptHint: string;
}

export const DEFAULT_VIDEO_TYPE_RULES: Record<VideoType, ShotRule> = {
  store_tour: {
    label: '探店视频',
    required: [
      { slot: 'storefront', label: '门头照', minCount: 1, hint: '能看见 BOOMER·OFF 招牌或店铺入口' },
      { slot: 'wide_interior', label: '店内全景', minCount: 1, hint: '一张能看见整面货架或大空间的广角' },
      { slot: 'shelf_display', label: '货架陈列', minCount: 1, hint: '密集陈列特写，体现"海量"' },
      { slot: 'rummage_bin', label: '翻筐区特写', minCount: 1, hint: '客人翻筐或筐内俯拍' },
    ],
    recommended: [
      { slot: 'staff', label: '店员侧脸/手', hint: '不正脸' },
      { slot: 'lighting', label: '灯光氛围', hint: '暖光、霓虹、有质感的局部' },
    ],
    scriptHint: '节奏：门头钩子(1–2s) → 店内全景(2–3s) → 货架/翻筐快剪(3–6s) → 一个治愈定格收尾。字幕克制。',
  },
  product_showcase: {
    label: '产品展示',
    required: [
      { slot: 'product_front', label: '商品正面', minCount: 1, hint: '商品主体在画面 60% 以上' },
      { slot: 'product_detail', label: '商品细节', minCount: 1, hint: '材质/做工/印记的微距' },
      { slot: 'product_scene', label: '商品场景', minCount: 1, hint: '商品在货架上或在手里' },
    ],
    recommended: [
      { slot: 'product_hand', label: '上手把玩', hint: '把它拿在手里转一下' },
    ],
    scriptHint: '节奏：钩子点出"这是什么/为什么动心"(0–2s) → 正面+细节+场景三镜递进(2–10s) → 一句藏家口吻收尾。',
  },
  store_ambience: {
    label: '店铺氛围',
    required: [
      { slot: 'wide_interior', label: '店内全景', minCount: 1, hint: '广角，呈现空间感' },
      { slot: 'shelf_display', label: '局部陈列', minCount: 1, hint: '一组陈列' },
      { slot: 'lighting', label: '灯光特写', minCount: 1, hint: '暖光、霓虹或自然光局部' },
    ],
    recommended: [
      { slot: 'storefront', label: '门头', hint: '街景或招牌' },
      { slot: 'visitor', label: '顾客剪影', hint: '不正脸' },
    ],
    scriptHint: '节奏：慢镜叠化，字幕极少；像在播一段店内 BGM 短片，不强行卖货。',
  },
  new_arrival: {
    label: '新品上架',
    required: [
      { slot: 'product_front', label: '商品正面', minCount: 1, hint: '主图' },
      { slot: 'product_angle', label: '商品多角度', minCount: 2, hint: '左/右/背面任两张' },
      { slot: 'product_detail', label: '商品细节', minCount: 1, hint: '材质/做工微距' },
    ],
    recommended: [
      { slot: 'product_scene', label: '上架陈列位', hint: '商品已经摆到货架上的样子' },
      { slot: 'product_tag', label: '价签/标签', hint: '能看到价格或标记' },
    ],
    scriptHint: '节奏：标签"新到一件"(0–2s) → 多角度展示(2–10s) → 上架位收尾，引导到店翻看。',
  },
};

// 兼容旧 import 名
export const VIDEO_TYPE_RULES = DEFAULT_VIDEO_TYPE_RULES;
export const VIDEO_TYPE_LABEL: Record<VideoType, string> = Object.fromEntries(
  Object.entries(DEFAULT_VIDEO_TYPE_RULES).map(([k, v]) => [k, v.label])
) as Record<VideoType, string>;

// 从数据库加载预设;失败/缺失项使用默认常量。
export interface MarketingPresets {
  brand: string;
  platforms: Record<string, string>;
  tones: Record<string, string>;
  videoRules: Record<VideoType, ShotRule>;
}

export async function loadMarketingPresets(): Promise<MarketingPresets> {
  const fallback: MarketingPresets = {
    brand: DEFAULT_BRAND_SYSTEM_PROMPT,
    platforms: DEFAULT_PLATFORM_BRIEF,
    tones: DEFAULT_TONE_BRIEF,
    videoRules: DEFAULT_VIDEO_TYPE_RULES,
  };
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return fallback;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data } = await admin.from("marketing_presets").select("key, value");
    if (!data || !data.length) return fallback;
    const m: Record<string, any> = {};
    for (const row of data as any[]) m[row.key] = row.value;
    return {
      brand: typeof m.brand_system_prompt === "string" ? m.brand_system_prompt : fallback.brand,
      platforms: (m.platform_brief && typeof m.platform_brief === "object") ? m.platform_brief : fallback.platforms,
      tones: (m.tone_brief && typeof m.tone_brief === "object") ? m.tone_brief : fallback.tones,
      videoRules: (m.video_type_rules && typeof m.video_type_rules === "object") ? m.video_type_rules : fallback.videoRules,
    };
  } catch (e) {
    console.error("[presets] load fail", e);
    return fallback;
  }
}
