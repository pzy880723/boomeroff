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


export const ROLE_LABELS: Record<AppRole, string> = {
  admin: '管理员',
  anchor: '店员',
};
