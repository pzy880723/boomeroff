
-- 1) direct_messages 附件字段
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- 2) push_tokens 表
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  token text NOT NULL,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens_owner_all" ON public.push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) 群聊占位表
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  avatar_url text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_rooms TO authenticated;
GRANT ALL ON public.chat_rooms TO service_role;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_room_members TO authenticated;
GRANT ALL ON public.chat_room_members TO service_role;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_room_member(_room uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = _room AND user_id = _user
  );
$$;

CREATE POLICY "chat_rooms_member_read" ON public.chat_rooms
  FOR SELECT TO authenticated
  USING (public.is_chat_room_member(id, auth.uid()) OR created_by = auth.uid());

CREATE POLICY "chat_rooms_creator_write" ON public.chat_rooms
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "chat_rooms_creator_update" ON public.chat_rooms
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "chat_room_members_self_read" ON public.chat_room_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_room_member(room_id, auth.uid()));

CREATE POLICY "chat_room_members_owner_manage" ON public.chat_room_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_rooms r WHERE r.id = room_id AND r.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_rooms r WHERE r.id = room_id AND r.created_by = auth.uid()));

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text,
  attachment_type text,
  attachment_url text,
  attachment_name text,
  attachment_size bigint,
  attachment_mime text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_member_read" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.is_chat_room_member(room_id, auth.uid()));

CREATE POLICY "chat_messages_member_send" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_room_member(room_id, auth.uid()));

CREATE INDEX IF NOT EXISTS chat_messages_room_created_idx ON public.chat_messages(room_id, created_at DESC);
