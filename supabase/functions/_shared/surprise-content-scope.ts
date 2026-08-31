export type SurpriseContentScopeKey = 'all' | 'ceramics' | 'toys' | 'music' | 'accessories';

export interface SurpriseContentAsset {
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
    matches: keywordMatcher(/玩具|公仔|手办|玩偶|软胶|毛绒|动漫|卡通|奥特曼|骑士|三丽鸥|不二家|怪兽/),
    prompt: `【内容范围：玩具公仔】
除第1镜真实门头外，其他镜头只能围绕中古玩具、公仔、手办、软胶玩偶、毛绒玩具和动漫周边展开。
优先展示玩具墙、成排公仔、单件拿取、造型与包装细节；对白突出童年记忆、丰富陈列和淘到喜欢角色的兴奋感。
只有素材标签明确识别出角色名称时才能说出IP名称，禁止编造限量、绝版、正版授权、年份或价格。`,
  },
  {
    key: 'music',
    label: '唱片音响',
    matches: keywordMatcher(/唱片|黑胶|音响|音乐|磁带|随身听|收音机/),
    prompt: `【内容范围：唱片音响】
除第1镜真实门头外，其他镜头只能围绕黑胶唱片、唱片封面、复古音响、收音机、磁带和音乐设备展开。
优先展示翻找唱片、封面设计、唱片纹理、音响旋钮和整排陈列；对白突出探索感、设计感和复古音乐氛围。
资料未明确时不得说出歌手、专辑、设备型号或发行年份，未经检测不得声称设备能够正常播放或音质优秀。`,
  },
  {
    key: 'accessories',
    label: '首饰配饰',
    matches: keywordMatcher(/首饰|配饰|戒指|胸针|项链|耳饰|耳环|领带|服饰|包/),
    prompt: `【内容范围：首饰配饰】
除第1镜真实门头外，其他镜头只能围绕戒指、胸针、项链、耳饰、领带和复古配饰展开。
优先展示饰品陈列、手部拿取、佩戴效果、纹样细节和不同造型之间的搭配；对白突出日常穿搭点睛和找到独特款式的惊喜感。
没有明确资料时不得声称贵金属、天然宝石、具体品牌、年代或真伪。`,
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
