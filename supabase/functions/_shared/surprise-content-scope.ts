export type SurpriseContentScopeKey = 'all' | 'ceramics' | 'toys' | 'music' | 'accessories';

export interface SurpriseContentAsset {
  id?: unknown;
  category?: unknown;
  tags?: unknown;
}

export interface SurpriseContentScope {
  key: SurpriseContentScopeKey;
  label: string;
  prompt: string;
  matches: (asset: SurpriseContentAsset) => boolean;
}

function searchableAssetText(asset: SurpriseContentAsset): string {
  const tags = Array.isArray(asset.tags) ? asset.tags : [];
  return [asset.category, ...tags]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function keywordMatcher(pattern: RegExp) {
  return (asset: SurpriseContentAsset) => pattern.test(searchableAssetText(asset));
}

const CONTENT_SCOPES: SurpriseContentScope[] = [
  {
    key: 'all',
    label: '全品类',
    matches: () => true,
    prompt: `【内容范围：全品类】
不限制商品品类，从当前门店全部真实素材中选择最有吸引力、最适合视频表现的内容。
视频主旨是“这家中古杂货铺为什么值得专程来逛”，15秒内只选2-3种最有代表性的商品形成递进，禁止像报菜名一样堆砌全部品类。
镜头结构：真实门头 → 店内整体宝藏感 → 代表商品一 → 代表商品二或淘货细节 → 到店召唤。
每一项商品都必须在参考图片中真实存在。`,
  },
  {
    key: 'ceramics',
    label: '瓷器餐具',
    matches: keywordMatcher(/瓷|陶|杯|碟|餐具|茶具|器皿/),
    prompt: `【内容范围：瓷器餐具】
【目标人群】主要面向45-68岁的中老年及退休人群。人物必须精神、热情、喜欢生活，像熟人兴奋推荐；禁止塑造成迟缓、暮气沉沉或被取笑的老人。
【已确认卖点】全场商品6.9元起；日本瓷器和欧洲瓷器都有；杯、盘、碗、碟等款式丰富、花色漂亮、选择多、价格亲民；核心主旨是“退休生活不要总待在家，来BOOMER OFF慢慢逛、慢慢挑”。
【镜头分配】第1镜使用当前门店真实门头并热情邀请退休人群出来逛；第2镜展示日本瓷器与欧洲瓷器陈列；第3镜展示杯盘碗碟和全场6.9元起的价格吸引力；第4镜表现拿起、比较、慢慢挑选，突出丰富和实用；第5镜热情邀请观众到当前门店淘一套回家。
【表达要求】全片热情、兴奋、亲切，语速快而清楚。可以随机改写表达，但不得照抄示例，不得每次生成同一套对白。
【禁止事项】不要使用“老头、老太婆、老年人没事干”等冒犯性表达；不得编造瓷器品牌、具体年代、窑口、材质、产地故事、收藏价值以及未确认活动。`,
  },
  {
    key: 'toys',
    label: '玩具公仔',
    matches: keywordMatcher(/玩具|公仔|手办|玩偶|软胶|毛绒|动漫|卡通|奥特曼|骑士|三丽鸥|不二家|怪兽|hello\s*kitty|凯蒂猫|迪士尼|佐藤象|谷子/),
    prompt: `【内容范围：玩具公仔】
第1镜必须使用当前门店真实门头，人物兴奋地带观众进店。
第2镜优先展示 Hello Kitty、迪士尼、佐藤象等有真实参考图的代表玩具。
第3镜展示成排公仔、玩偶和翻不完的中古谷子，突出数量多、选择多。
第4镜表现人物翻找、拿起并发现喜欢的角色，突出童年回忆和淘到本命的兴奋。
第5镜邀请观众带朋友到店认真翻一圈。
对白像真实潮玩爱好者安利，活泼但不堆网络烂梗。只有参考图片和标签确认的角色才能点名；缺少对应图片时不得编造。
禁止编造正版、绝版、限量、年份、价格和收藏价值。`,
  },
  {
    key: 'music',
    label: '唱片音响',
    matches: keywordMatcher(/唱片|黑胶|音响|音乐|磁带|随身听|收音机/),
    prompt: `【内容范围：唱片音响】
第1镜必须使用当前门店真实门头，人物带观众快速进店。
第2镜展示整排黑胶唱片和连续翻找动作，建立“唱片很多、值得慢慢淘”的认知。
第3镜展示真实唱片封面、黑胶纹路和陈列细节。
第4镜表现人物继续翻找并发现合眼缘唱片，突出封面设计、年代氛围和寻宝体验。
第5镜邀请喜欢音乐与复古设计的人到店翻唱片。
对白要有音乐爱好者的兴奋和审美，但不得声称未测试的音质。资料未明确时不得编造歌手、专辑、设备型号、发行年份和价格。`,
  },
  {
    key: 'accessories',
    label: '首饰配饰',
    matches: keywordMatcher(/首饰|配饰|戒指|胸针|项链|耳饰|耳环|领带|服饰|包/),
    prompt: `【内容范围：首饰配饰】
第1镜必须使用当前门店真实门头，人物带观众进店寻宝。
第2镜展示首饰柜台和丰富陈列，只讲参考图中真实存在的耳饰、项链、胸针等。
第3镜展示手部拿取、纹样、金属光泽和造型细节。
第4镜表现人物试戴或贴近衣服比较，突出穿搭点睛、不易撞款和慢慢挑选的乐趣。
第5镜邀请观众到店亲手试戴，找到最适合自己的一件。
人物应是有穿搭兴趣的年轻或中年顾客，表达精致、热情、有审美。不得编造贵金属、天然宝石、品牌、年代、真伪、收藏价值和材质。`,
  },
];

export function listSurpriseContentScopes(): SurpriseContentScope[] {
  return CONTENT_SCOPES.slice();
}

export function resolveSurpriseContentScope(value: unknown): SurpriseContentScope {
  const key = String(
    value && typeof value === 'object' && 'key' in value
      ? (value as { key?: unknown }).key
      : value || 'all',
  ).trim().toLowerCase();
  return CONTENT_SCOPES.find((scope) => scope.key === key) || CONTENT_SCOPES[0];
}

export function buildSurpriseContentScopePrompt(scope: SurpriseContentScope): string {
  return scope.prompt;
}

export function filterAssetsForSurpriseContentScope<T extends SurpriseContentAsset>(
  scope: SurpriseContentScope,
  assets: T[],
): T[] {
  if (scope.key === 'all') return assets.slice();
  return assets.filter((asset) => scope.matches(asset));
}
