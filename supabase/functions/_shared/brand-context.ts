// 营销中心共用的品牌上下文。改一处全改。
// 所有面向小红书 / 抖音 / 视频号 / 朋友圈的文案与脚本生成都自动注入这段系统提示，
// 店员不需要每次告诉 AI 我们是谁。
export const BRAND_SYSTEM_PROMPT = `你正在为「BOOMER·OFF Vintage」做社交媒体内容。
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

// 视频类型的镜位规则。每个类型有「必备镜位」+「推荐镜位」，
// analyze-marketing-assets 会按这套规则判断素材够不够。
export type VideoType = 'store_tour' | 'product_showcase' | 'store_ambience' | 'new_arrival';

export interface ShotRule {
  label: string;
  // 每个 slot 对应一类镜位，必须满足 minCount 张
  required: { slot: string; label: string; minCount: number; hint: string }[];
  recommended: { slot: string; label: string; hint: string }[];
  // 脚本提示：这种类型的视频应该怎么剪
  scriptHint: string;
}

export const VIDEO_TYPE_RULES: Record<VideoType, ShotRule> = {
  store_tour: {
    label: '探店视频',
    required: [
      { slot: 'storefront', label: '门头照', minCount: 1, hint: '能看见 BOOMER·OFF 招牌或店铺入口' },
      { slot: 'wide_interior', label: '店内全景', minCount: 1, hint: '一张能看见整面货架或大空间的广角' },
      { slot: 'shelf_display', label: '货架陈列', minCount: 1, hint: '密集陈列特写，体现"海量"' },
      { slot: 'rummage_bin', label: '翻筐区特写', minCount: 1, hint: '客人翻筐或筐内俯拍' },
    ],
    recommended: [
      { slot: 'staff', label: '店员侧脸/手', hint: '不正脸，体现"主理人"感' },
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

export const VIDEO_TYPE_LABEL: Record<VideoType, string> = Object.fromEntries(
  Object.entries(VIDEO_TYPE_RULES).map(([k, v]) => [k, v.label])
) as Record<VideoType, string>;
