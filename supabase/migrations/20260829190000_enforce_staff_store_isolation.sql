-- Store isolation boundary:
-- management roles may access every store; regular staff are bound to staff_profiles.shop_id.

-- Shops shown inside authenticated app sessions.
DROP POLICY IF EXISTS "shops read" ON public.shops;
CREATE POLICY "shops read by access scope"
ON public.shops FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR id = public.current_user_shop_id()
);

DROP POLICY IF EXISTS "shops write by perm" ON public.shops;
CREATE POLICY "shops write by access scope"
ON public.shops FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.write')
    AND id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.write')
    AND id = public.current_user_shop_id()
  )
);

-- Staff directory writes must not move or edit people in another store.
DROP POLICY IF EXISTS "staff write by perm" ON public.staff_profiles;
CREATE POLICY "staff write by access scope"
ON public.staff_profiles FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'staff.write')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'staff.write')
    AND shop_id = public.current_user_shop_id()
  )
);

-- Marketing asset library.
DROP POLICY IF EXISTS "authenticated shared read" ON public.marketing_assets;
DROP POLICY IF EXISTS "own delete" ON public.marketing_assets;
DROP POLICY IF EXISTS "own update" ON public.marketing_assets;
DROP POLICY IF EXISTS "self insert" ON public.marketing_assets;

CREATE POLICY "marketing assets read by store"
ON public.marketing_assets FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id = public.current_user_shop_id()
);

CREATE POLICY "marketing assets insert by store"
ON public.marketing_assets FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

CREATE POLICY "marketing assets update owner in store"
ON public.marketing_assets FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

CREATE POLICY "marketing assets delete owner in store"
ON public.marketing_assets FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

-- Legacy 15-second generation jobs.
DROP POLICY IF EXISTS "own jobs read" ON public.marketing_video_jobs;
DROP POLICY IF EXISTS "own jobs update" ON public.marketing_video_jobs;
DROP POLICY IF EXISTS "own jobs write" ON public.marketing_video_jobs;

CREATE POLICY "marketing video jobs read by store"
ON public.marketing_video_jobs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id = public.current_user_shop_id()
);

CREATE POLICY "marketing video jobs insert by store"
ON public.marketing_video_jobs FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

CREATE POLICY "marketing video jobs update owner in store"
ON public.marketing_video_jobs FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

-- Director jobs and their shots.
DROP POLICY IF EXISTS "vgj_owner_delete" ON public.video_generation_jobs;
DROP POLICY IF EXISTS "vgj_owner_insert" ON public.video_generation_jobs;
DROP POLICY IF EXISTS "vgj_owner_select" ON public.video_generation_jobs;
DROP POLICY IF EXISTS "vgj_owner_update" ON public.video_generation_jobs;

CREATE POLICY "video jobs read by store"
ON public.video_generation_jobs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id = public.current_user_shop_id()
);

CREATE POLICY "video jobs insert by store"
ON public.video_generation_jobs FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

CREATE POLICY "video jobs update owner in store"
ON public.video_generation_jobs FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

CREATE POLICY "video jobs delete owner in store"
ON public.video_generation_jobs FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (user_id = auth.uid() AND shop_id = public.current_user_shop_id())
);

DROP POLICY IF EXISTS "vgs_owner_select" ON public.video_generation_shots;
DROP POLICY IF EXISTS "vgs_owner_write" ON public.video_generation_shots;

CREATE POLICY "video shots read through store job"
ON public.video_generation_shots FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.video_generation_jobs job
    WHERE job.id = video_generation_shots.job_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR job.shop_id = public.current_user_shop_id()
      )
  )
);

CREATE POLICY "video shots write through owned store job"
ON public.video_generation_shots FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.video_generation_jobs job
    WHERE job.id = video_generation_shots.job_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (job.user_id = auth.uid() AND job.shop_id = public.current_user_shop_id())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.video_generation_jobs job
    WHERE job.id = video_generation_shots.job_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (job.user_id = auth.uid() AND job.shop_id = public.current_user_shop_id())
      )
  )
);

-- Reusable character library.
DROP POLICY IF EXISTS "authenticated insert shop characters" ON public.marketing_characters;
DROP POLICY IF EXISTS "creator or admin delete characters" ON public.marketing_characters;
DROP POLICY IF EXISTS "creator or admin update characters" ON public.marketing_characters;
DROP POLICY IF EXISTS "marketing_characters same shop or creator or admin select" ON public.marketing_characters;

CREATE POLICY "characters read by store"
ON public.marketing_characters FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id = public.current_user_shop_id()
);

CREATE POLICY "characters insert by store"
ON public.marketing_characters FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (created_by = auth.uid() AND shop_id = public.current_user_shop_id())
);

CREATE POLICY "characters update owner in store"
ON public.marketing_characters FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (created_by = auth.uid() AND shop_id = public.current_user_shop_id())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (created_by = auth.uid() AND shop_id = public.current_user_shop_id())
);

CREATE POLICY "characters delete owner in store"
ON public.marketing_characters FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (created_by = auth.uid() AND shop_id = public.current_user_shop_id())
);

DROP POLICY IF EXISTS "character_assets_insert_owner" ON public.marketing_character_assets;
DROP POLICY IF EXISTS "character_assets_select_same_shop" ON public.marketing_character_assets;
DROP POLICY IF EXISTS "character_assets_update_owner" ON public.marketing_character_assets;

CREATE POLICY "character assets read by store"
ON public.marketing_character_assets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.marketing_characters character
    WHERE character.id = marketing_character_assets.character_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR character.shop_id = public.current_user_shop_id()
      )
  )
);

CREATE POLICY "character assets insert by store"
ON public.marketing_character_assets FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.marketing_characters character
      WHERE character.id = marketing_character_assets.character_id
        AND character.shop_id = public.current_user_shop_id()
    )
  )
);

CREATE POLICY "character assets update owner in store"
ON public.marketing_character_assets FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.marketing_characters character
      WHERE character.id = marketing_character_assets.character_id
        AND character.shop_id = public.current_user_shop_id()
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.marketing_characters character
      WHERE character.id = marketing_character_assets.character_id
        AND character.shop_id = public.current_user_shop_id()
    )
  )
);

-- Store profiles and store knowledge. NULL shop_id remains brand-level shared content.
DROP POLICY IF EXISTS "shop marketing profiles read" ON public.shop_marketing_profiles;
DROP POLICY IF EXISTS "shop marketing profiles write" ON public.shop_marketing_profiles;
DROP POLICY IF EXISTS "shop marketing profiles update" ON public.shop_marketing_profiles;
DROP POLICY IF EXISTS "shop marketing profiles delete" ON public.shop_marketing_profiles;

CREATE POLICY "shop marketing profiles read by store"
ON public.shop_marketing_profiles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id = public.current_user_shop_id()
);

CREATE POLICY "shop marketing profiles insert by store"
ON public.shop_marketing_profiles FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.write')
    AND shop_id = public.current_user_shop_id()
  )
);

CREATE POLICY "shop marketing profiles update by store"
ON public.shop_marketing_profiles FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.write')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.write')
    AND shop_id = public.current_user_shop_id()
  )
);

CREATE POLICY "shop marketing profiles delete by store"
ON public.shop_marketing_profiles FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.write')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "kb_documents staff read by shop" ON public.kb_documents;
CREATE POLICY "kb documents staff read by store"
ON public.kb_documents FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id IS NULL
  OR shop_id = public.current_user_shop_id()
);

DROP POLICY IF EXISTS "kb cats read" ON public.shop_kb_categories;
CREATE POLICY "kb cats read by store"
ON public.shop_kb_categories FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id IS NULL
  OR shop_id = public.current_user_shop_id()
);

DROP POLICY IF EXISTS "kb entries read" ON public.shop_kb_entries;
CREATE POLICY "kb entries read by store"
ON public.shop_kb_entries FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id IS NULL
  OR shop_id = public.current_user_shop_id()
);

-- Scheduling data follows the same store boundary.
DROP POLICY IF EXISTS "holidays read" ON public.shop_holidays;
CREATE POLICY "holidays read by store"
ON public.shop_holidays FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id IS NULL
  OR shop_id = public.current_user_shop_id()
);

DROP POLICY IF EXISTS "holidays write by perm" ON public.shop_holidays;
CREATE POLICY "holidays write by store"
ON public.shop_holidays FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'holiday.write')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'holiday.write')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "shifts read" ON public.shop_shifts;
CREATE POLICY "shifts read by store"
ON public.shop_shifts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR shop_id IS NULL
  OR shop_id = public.current_user_shop_id()
);

DROP POLICY IF EXISTS "shifts write by perm" ON public.shop_shifts;
CREATE POLICY "shifts write by store"
ON public.shop_shifts FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shift.write')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shift.write')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "schedules read own or staff" ON public.shift_schedules;
CREATE POLICY "schedules read by store"
ON public.shift_schedules FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'staff.read')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "schedules write by perm" ON public.shift_schedules;
CREATE POLICY "schedules write by store"
ON public.shift_schedules FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'schedule.write')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'schedule.write')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "day_offs read self or has perm" ON public.staff_day_offs;
CREATE POLICY "day offs read by store"
ON public.staff_day_offs FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'staff.read')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "day_offs write by perm" ON public.staff_day_offs;
CREATE POLICY "day offs write by store"
ON public.staff_day_offs FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'dayoff.write')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'dayoff.write')
    AND shop_id = public.current_user_shop_id()
  )
);

-- Store knowledge writes: brand-level rows stay management-only.
DROP POLICY IF EXISTS "kb cats write by perm" ON public.shop_kb_categories;
CREATE POLICY "kb cats write by store"
ON public.shop_kb_categories FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.kb.category')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.kb.category')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "kb entries write by perm" ON public.shop_kb_entries;
CREATE POLICY "kb entries write by store"
ON public.shop_kb_entries FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.kb.write')
    AND shop_id = public.current_user_shop_id()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'shop.kb.write')
    AND shop_id = public.current_user_shop_id()
  )
);

-- Remove the old ERP-wide bypass. Staff can operate only their own store.
DROP POLICY IF EXISTS "automation_tasks erp shared all" ON public.automation_tasks;
CREATE POLICY "automation tasks staff own store"
ON public.automation_tasks FOR ALL TO authenticated
USING (shop_id = public.current_user_shop_id())
WITH CHECK (
  shop_id = public.current_user_shop_id()
  AND (created_by IS NULL OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "social_accounts erp shared all" ON public.social_accounts;
DROP POLICY IF EXISTS "spj erp shared all" ON public.social_publish_jobs;

DROP POLICY IF EXISTS "social_accounts staff own shop update" ON public.social_accounts;
CREATE POLICY "social_accounts staff own shop update"
ON public.social_accounts FOR UPDATE TO authenticated
USING (shop_id = public.current_user_shop_id())
WITH CHECK (shop_id = public.current_user_shop_id());

DROP POLICY IF EXISTS "spj staff own shop update" ON public.social_publish_jobs;
CREATE POLICY "spj staff own shop update"
ON public.social_publish_jobs FOR UPDATE TO authenticated
USING (shop_id = public.current_user_shop_id())
WITH CHECK (shop_id = public.current_user_shop_id());

-- Managers may operate all vouchers; other permitted users stay inside their store.
DROP POLICY IF EXISTS "vouchers manager read" ON public.vouchers;
CREATE POLICY "vouchers manager read by store"
ON public.vouchers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'voucher.manage')
    AND shop_id = public.current_user_shop_id()
  )
);

DROP POLICY IF EXISTS "vouchers manager insert" ON public.vouchers;
CREATE POLICY "vouchers manager insert by store"
ON public.vouchers FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.user_has_permission(auth.uid(), 'voucher.manage')
    AND created_by = auth.uid()
    AND shop_id = public.current_user_shop_id()
  )
);
