import type { LucideIcon } from 'lucide-react';
import {
  Cherry, Crown, Flame, Landmark, MapPin, ToyBrick, Sparkles, Gem, Diamond,
  Gamepad2, Headphones, Camera, Disc3, Radio, Tv, Puzzle, Package,
} from 'lucide-react';

export type AppRole = 'admin' | 'anchor';

// 新品类（推荐使用）+ 旧品类（保留以兼容历史数据）
export type ProductCategory =
  // 新品类
  | 'jp_porcelain'
  | 'eu_porcelain'
  | 'incense'
  | 'antique_art'
  | 'local_craft'
  | 'anime_toy'
  | 'otaku_goods'
  | 'luxury'
  | 'vintage_jewelry'
  | 'game_console'
  | 'walkman'
  | 'ccd'
  | 'media_record'
  | 'playback_device'
  | 'home_appliance'
  | 'hobby'
  | 'other'
  // 旧品类（向后兼容历史数据，不在 UI 选择器中显示）
  | 'porcelain'
  | 'stationery'
  | 'lacquerware'
  | 'bronze'
  | 'woodcraft'
  | 'textile'
  | 'jewelry'
  | 'painting';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  description?: string;
  era?: string;
  origin?: string;
  material?: string;
  craft?: string;
  dimensions?: string;
  condition?: string;
  image_url?: string;
  selling_points?: string[];
  tips?: string;
  ai_analysis?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface CurrentSession {
  id: string;
  product_id?: string;
  operator_id?: string;
  is_active: boolean;
  started_at: string;
  updated_at: string;
}

export interface RecognitionResult {
  name: string;
  category: ProductCategory;
  era?: string;
  origin?: string;
  material?: string;
  craft?: string;
  dimensions?: string;
  condition?: string;
  description?: string;
  // 新结构：带标签的卖点；老数据可能是 string[]
  sellingPoints?: Array<string | { tag: string; text: string }>;
  // 新增：开场+亮点双句模板
  pitch?: { opener: string; highlight: string; story?: string };
  // 新结构：记忆口诀+顾客应答；老数据可能是 string
  tips?: string | { memory?: string; objection?: string };
  confidence?: number;
  imageHash?: string;
  fromCache?: boolean;
  // 命中来源：'hash' | 'official' | 'history'
  cacheSource?: string;
  // 上次入库时间（ISO）
  cachedAt?: string;
  // 命中的 product 行 id，便于做"加入知识库/收藏"时复用
  cachedProductId?: string;
  // 同款最近一次价格记录
  recentPrice?: {
    price: number;
    price_type: string | null;
    recorded_at: string | null;
  };
  // 路径元数据：本次识别实际走了哪条 AI 链路（缓存 / Gemini）
  __pipeline?: {
    source: 'hash_cache' | 'name_cache' | 'lovable_gemini';
    model?: string;
    cacheSource?: string;
    webSearchEnabled?: boolean;
    webSearchUsed?: boolean;
    aiTimeMs?: number;
  };
  // 后台深度补充结果（identification 后异步生成）
  enriched?: {
    story?: string;
    highlight?: string;
    description?: string;
    sellingPoints?: Array<{ tag: string; text: string }>;
    objection?: string;
    memory?: string;
    webSearchUsed?: boolean;
    updatedAt?: string;
  };
  // UI 临时态：是否正在跑后台 enrich
  isEnriching?: boolean;
}

export interface DailyKnowledge {
  id: string;
  date: string;
  content: {
    summary?: string;
    highlights?: string[];
    featured?: Array<{ name: string; point: string; image_url?: string | null }>;
  };
  created_at: string;
}

// 中文标签：包含新旧全部品类
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  // 新品类
  jp_porcelain: '日瓷',
  eu_porcelain: '欧瓷',
  incense: '线香',
  antique_art: '古美术',
  local_craft: '本地特色',
  anime_toy: '动漫玩具',
  otaku_goods: '二次元周边',
  luxury: '奢侈品',
  vintage_jewelry: '中古首饰',
  game_console: '游戏机',
  walkman: '随身听',
  ccd: 'CCD',
  media_record: '音像制品',
  playback_device: '播放设备',
  home_appliance: '家用电器',
  hobby: '兴趣爱好',
  other: '其他',
  // 旧品类
  porcelain: '瓷器',
  stationery: '文房四宝',
  lacquerware: '漆器',
  bronze: '铜器',
  woodcraft: '木器',
  textile: '织物/布艺',
  jewelry: '首饰/饰品',
  painting: '书画',
};

// UI 中可选品类的显示顺序（旧品类不在内）
export const CATEGORY_ORDER: ProductCategory[] = [
  'jp_porcelain',
  'eu_porcelain',
  'incense',
  'antique_art',
  'local_craft',
  'anime_toy',
  'otaku_goods',
  'luxury',
  'vintage_jewelry',
  'game_console',
  'walkman',
  'ccd',
  'media_record',
  'playback_device',
  'home_appliance',
  'hobby',
  'other',
];

// 品类图标映射
export const CATEGORY_ICONS: Record<ProductCategory, LucideIcon> = {
  jp_porcelain: Cherry,
  eu_porcelain: Crown,
  incense: Flame,
  antique_art: Landmark,
  local_craft: MapPin,
  anime_toy: ToyBrick,
  otaku_goods: Sparkles,
  luxury: Gem,
  vintage_jewelry: Diamond,
  game_console: Gamepad2,
  walkman: Headphones,
  ccd: Camera,
  media_record: Disc3,
  playback_device: Radio,
  home_appliance: Tv,
  hobby: Puzzle,
  other: Package,
  // 旧品类沿用通用图标
  porcelain: Cherry,
  stationery: Package,
  lacquerware: Package,
  bronze: Package,
  woodcraft: Package,
  textile: Package,
  jewelry: Diamond,
  painting: Package,
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: '管理员',
  anchor: '店员',
};

// 二级类目 - 品牌/IP/窑口维度（official_knowledge.brand）
export const CATEGORY_BRANDS: Record<ProductCategory, string[]> = {
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
  porcelain: [], stationery: [], lacquerware: [], bronze: [], woodcraft: [], textile: [], jewelry: [], painting: [],
};

// 二级类目 - 类型/工艺/题材维度（official_knowledge.sub_type）
export const CATEGORY_TYPES: Record<ProductCategory, string[]> = {
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
  porcelain: [], stationery: [], lacquerware: [], bronze: [], woodcraft: [], textile: [], jewelry: [], painting: [],
};

// 兼容旧引用
export const CATEGORY_SUBCATEGORIES = CATEGORY_TYPES;
