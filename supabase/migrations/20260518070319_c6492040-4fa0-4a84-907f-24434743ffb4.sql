-- spirit_conversations
CREATE TABLE public.spirit_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '新对话',
  summary text,
  archived boolean NOT NULL DEFAULT false,
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_spirit_conv_user ON public.spirit_conversations(user_id, last_message_at DESC);
ALTER TABLE public.spirit_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own conv select" ON public.spirit_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own conv insert" ON public.spirit_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own conv update" ON public.spirit_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own conv delete" ON public.spirit_conversations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_spirit_conv_updated
  BEFORE UPDATE ON public.spirit_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- spirit_messages
CREATE TABLE public.spirit_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.spirit_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_spirit_msg_conv ON public.spirit_messages(conversation_id, created_at);
ALTER TABLE public.spirit_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own msg select" ON public.spirit_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own msg insert" ON public.spirit_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own msg delete" ON public.spirit_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 自动维护 conversation.message_count + last_message_at
CREATE OR REPLACE FUNCTION public.spirit_bump_conv()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.spirit_conversations
    SET message_count = message_count + 1,
        last_message_at = NEW.created_at,
        updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_spirit_msg_bump
  AFTER INSERT ON public.spirit_messages
  FOR EACH ROW EXECUTE FUNCTION public.spirit_bump_conv();

-- spirit_usage
CREATE TABLE public.spirit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.spirit_conversations(id) ON DELETE SET NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tool_calls integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_spirit_usage_user_day ON public.spirit_usage(user_id, created_at DESC);
ALTER TABLE public.spirit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own usage select" ON public.spirit_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 限频与模型默认配置
INSERT INTO public.app_settings (key, value) VALUES
  ('spirit_model', '{"model":"google/gemini-3-flash-preview","temperature":0.6,"max_tokens":800}'::jsonb),
  ('spirit_rate_limits', '{"per_minute":10,"per_day":200}'::jsonb)
ON CONFLICT (key) DO NOTHING;