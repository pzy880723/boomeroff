-- Add suspended field to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS suspended boolean DEFAULT false;

-- Add suspended_at timestamp
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_user_roles_suspended ON public.user_roles(suspended) WHERE suspended = true;