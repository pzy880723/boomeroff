-- 创建邀请表
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'anchor',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_by UUID,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- 管理员可以管理邀请
CREATE POLICY "Admins can manage invitations"
ON public.invitations
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 所有人可以查看有效的邀请（用于验证邀请码）
CREATE POLICY "Anyone can view valid invitations"
ON public.invitations
FOR SELECT
USING (
  used_by IS NULL 
  AND expires_at > now()
);

-- 已认证用户可以使用邀请（更新used_by和used_at）
CREATE POLICY "Authenticated users can use invitations"
ON public.invitations
FOR UPDATE
USING (
  used_by IS NULL 
  AND expires_at > now()
)
WITH CHECK (
  used_by = auth.uid()
);

-- 创建索引
CREATE INDEX idx_invitations_code ON public.invitations(code);
CREATE INDEX idx_invitations_expires ON public.invitations(expires_at) WHERE used_by IS NULL;