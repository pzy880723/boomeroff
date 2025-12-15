export type AppRole = 'admin' | 'anchor';

export type ProductCategory = 
  | 'porcelain'
  | 'incense'
  | 'stationery'
  | 'lacquerware'
  | 'bronze'
  | 'woodcraft'
  | 'textile'
  | 'jewelry'
  | 'painting'
  | 'other';

export type ScriptStyle = 'professional' | 'sales' | 'cultural';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  description?: string;
  era?: string;
  material?: string;
  craft?: string;
  dimensions?: string;
  condition?: string;
  image_url?: string;
  scripts: Record<ScriptStyle, string>;
  ai_analysis?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PriceRecord {
  id: string;
  product_id: string;
  price_type: 'sold' | 'reference' | 'suggested';
  price: number;
  notes?: string;
  recorded_by?: string;
  created_at: string;
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

export interface EnrichedContent {
  basicIntro: string;        // 商品基础介绍（材质、工艺、尺寸）
  culturalBackground: string; // 文化背景（历史渊源、名家典故）
  usageScenario: string;     // 使用场景（适合什么场合、怎么搭配）
}

export interface RecognitionResult {
  name: string;
  category: ProductCategory;
  subCategory?: string;      // 细分类型：九谷烧、萩烧、备前烧等
  vesselType?: string;       // 器型：盖碗、主人杯、侧把壶等
  era?: string;
  material?: string;
  craft?: string;
  dimensions?: string;
  condition?: string;
  description?: string;
  enrichedContent?: EnrichedContent;
  scripts: {
    professional: string;
    sales: string;
    cultural: string;
  };
  suggestedPriceRange?: {
    min: number;
    max: number;
    average: number;
  };
  confidence?: number;
  imageHash?: string;
  fromCache?: boolean;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  porcelain: '瓷器',
  incense: '线香',
  stationery: '文房四宝',
  lacquerware: '漆器',
  bronze: '铜器',
  woodcraft: '木器',
  textile: '织物/布艺',
  jewelry: '首饰/饰品',
  painting: '书画',
  other: '其他',
};

export const SCRIPT_STYLE_LABELS: Record<ScriptStyle, string> = {
  professional: '简洁专业',
  sales: '销售导向',
  cultural: '文化知识',
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: '管理员',
  anchor: '主播',
};
