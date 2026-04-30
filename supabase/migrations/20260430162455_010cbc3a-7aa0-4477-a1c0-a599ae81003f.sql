
-- 1. official_knowledge
CREATE TABLE public.official_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category product_category NOT NULL DEFAULT 'other',
  ip_name TEXT,
  name TEXT NOT NULL,
  summary TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  era TEXT,
  origin TEXT,
  cover_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  selling_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  tips TEXT,
  source_product_id UUID,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.official_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Official knowledge readable by authenticated"
  ON public.official_knowledge FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins insert official knowledge"
  ON public.official_knowledge FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins update official knowledge"
  ON public.official_knowledge FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins delete official knowledge"
  ON public.official_knowledge FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_official_knowledge_updated_at
  BEFORE UPDATE ON public.official_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_official_knowledge_category ON public.official_knowledge(category);
CREATE INDEX idx_official_knowledge_ip ON public.official_knowledge(ip_name);

-- 2. user_favorites
CREATE TABLE public.user_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('official','product','recognition')),
  source_id UUID NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, source_type, source_id)
);
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own favorites"
  ON public.user_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own favorites"
  ON public.user_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own favorites"
  ON public.user_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_user_favorites_user ON public.user_favorites(user_id);

-- 3. community_posts
CREATE TABLE public.community_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID,
  image_url TEXT,
  name TEXT NOT NULL,
  category product_category NOT NULL DEFAULT 'other',
  era TEXT,
  origin TEXT,
  selling_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  tips TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  likes_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public posts readable by authenticated"
  ON public.community_posts FOR SELECT TO authenticated
  USING (is_public = true OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own posts"
  ON public.community_posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users or admins delete posts"
  ON public.community_posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_community_posts_created ON public.community_posts(created_at DESC);
CREATE INDEX idx_community_posts_user ON public.community_posts(user_id);
CREATE INDEX idx_community_posts_category ON public.community_posts(category);

-- 4. community_likes
CREATE TABLE public.community_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes readable by authenticated"
  ON public.community_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own likes"
  ON public.community_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own likes"
  ON public.community_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_sync_likes
  AFTER INSERT OR DELETE ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_likes_count();

-- 5. community_comments
CREATE TABLE public.community_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments readable by authenticated"
  ON public.community_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own comments"
  ON public.community_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own comments"
  ON public.community_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users or admins delete comments"
  ON public.community_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_community_comments_post ON public.community_comments(post_id, created_at);

CREATE OR REPLACE FUNCTION public.sync_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_sync_comments
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_comments_count();

-- 6. product_knowledge.is_official
ALTER TABLE public.product_knowledge ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

-- 7. realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER TABLE public.community_posts REPLICA IDENTITY FULL;
ALTER TABLE public.community_likes REPLICA IDENTITY FULL;
ALTER TABLE public.community_comments REPLICA IDENTITY FULL;
