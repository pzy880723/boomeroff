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
  sellingPoints?: string[];
  tips?: string;
  confidence?: number;
  imageHash?: string;
  fromCache?: boolean;
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
