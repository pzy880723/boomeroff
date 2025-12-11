-- 创建用户角色枚举
CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'assistant', 'anchor');

-- 创建用户角色表
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'anchor',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- 创建用户资料表
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建商品分类枚举
CREATE TYPE public.product_category AS ENUM (
    'porcelain',      -- 瓷器
    'incense',        -- 线香
    'stationery',     -- 文房四宝
    'lacquerware',    -- 漆器
    'bronze',         -- 铜器
    'woodcraft',      -- 木器
    'textile',        -- 织物/布艺
    'jewelry',        -- 首饰/饰品
    'painting',       -- 书画
    'other'           -- 其他
);

-- 创建话术风格枚举
CREATE TYPE public.script_style AS ENUM (
    'professional',   -- 简洁专业型
    'sales',          -- 销售导向型
    'cultural'        -- 文化知识型
);

-- 创建商品表
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category product_category NOT NULL DEFAULT 'other',
    description TEXT,
    era TEXT,                    -- 年代
    material TEXT,               -- 材质
    craft TEXT,                  -- 工艺
    dimensions TEXT,             -- 尺寸
    condition TEXT,              -- 品相
    image_url TEXT,
    scripts JSONB DEFAULT '{}', -- 存储不同风格的话术 {"professional": "...", "sales": "...", "cultural": "..."}
    ai_analysis JSONB,           -- AI识别的原始分析结果
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建价格记录表
CREATE TABLE public.price_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    price_type TEXT NOT NULL CHECK (price_type IN ('sold', 'reference', 'suggested')),
    price DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    recorded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建当前识别会话表（用于实时同步）
CREATE TABLE public.current_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    operator_id UUID REFERENCES auth.users(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 启用 RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_session ENABLE ROW LEVEL SECURITY;

-- 创建角色检查函数
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 创建获取用户角色函数
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- user_roles 策略
CREATE POLICY "Users can view their own role"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- profiles 策略
CREATE POLICY "Profiles are viewable by all authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- products 策略 - 所有认证用户可查看
CREATE POLICY "Products viewable by all authenticated users"
ON public.products FOR SELECT
TO authenticated
USING (true);

-- 操作员、小助理、管理员可创建商品
CREATE POLICY "Operators, assistants, admins can create products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'operator') OR
    public.has_role(auth.uid(), 'assistant')
);

-- 小助理和管理员可更新商品
CREATE POLICY "Assistants and admins can update products"
ON public.products FOR UPDATE
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
);

-- 仅管理员可删除商品
CREATE POLICY "Only admins can delete products"
ON public.products FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- price_records 策略
CREATE POLICY "Price records viewable by all authenticated users"
ON public.price_records FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Assistants and admins can manage price records"
ON public.price_records FOR INSERT
TO authenticated
WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Assistants and admins can update price records"
ON public.price_records FOR UPDATE
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Admins can delete price records"
ON public.price_records FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- current_session 策略
CREATE POLICY "Session viewable by all authenticated users"
ON public.current_session FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Operators and admins can manage session"
ON public.current_session FOR ALL
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'operator')
)
WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'operator')
);

-- 创建更新时间戳触发器
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_current_session_updated_at
BEFORE UPDATE ON public.current_session
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 创建用户注册时自动创建 profile 的触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
    
    -- 默认赋予主播角色（最低权限）
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'anchor');
    
    RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 启用实时同步
ALTER PUBLICATION supabase_realtime ADD TABLE public.current_session;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;