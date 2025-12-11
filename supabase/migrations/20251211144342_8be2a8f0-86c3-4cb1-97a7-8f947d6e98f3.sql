-- 添加图像特征字段用于知识库匹配
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_hash text;

-- 添加索引加速匹配
CREATE INDEX IF NOT EXISTS idx_products_image_hash ON products(image_hash);

-- 创建公开图片存储桶
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 存储桶访问策略 - 所有人可查看
CREATE POLICY "Product images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- 已认证用户可上传
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');