
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'announcement',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_notifications_active ON public.notifications (active, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications read active"
  ON public.notifications FOR SELECT TO authenticated
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "notifications write by perm"
  ON public.notifications FOR ALL TO authenticated
  USING (user_has_permission(auth.uid(), 'role.manage'))
  WITH CHECK (user_has_permission(auth.uid(), 'role.manage'));

-- Notification reads
CREATE TABLE public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX idx_notification_reads_user ON public.notification_reads (user_id);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reads select own"
  ON public.notification_reads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "reads insert own"
  ON public.notification_reads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reads delete own"
  ON public.notification_reads FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
