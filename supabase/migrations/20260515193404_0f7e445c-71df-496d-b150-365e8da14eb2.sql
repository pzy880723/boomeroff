
-- 1. 待领取事件奖励
CREATE TABLE public.exp_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  source_ref uuid,
  amount int NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);
CREATE UNIQUE INDEX exp_pending_uniq ON public.exp_pending(user_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX exp_pending_user_unclaimed ON public.exp_pending(user_id) WHERE claimed_at IS NULL;

ALTER TABLE public.exp_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending select own" ON public.exp_pending
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 2. 每日任务领取记录
CREATE TABLE public.task_claims (
  user_id uuid NOT NULL,
  task_key text NOT NULL,
  claim_date date NOT NULL,
  amount int NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_key, claim_date)
);
ALTER TABLE public.task_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_claims select own" ON public.task_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. 改造 trigger 函数:写入 exp_pending 而不是直接加经验
CREATE OR REPLACE FUNCTION public.exp_on_product_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND NOT public.has_role(NEW.created_by, 'admin') THEN
    INSERT INTO public.exp_pending(user_id, source, source_ref, amount, title)
    VALUES (NEW.created_by, 'product_insert', NEW.id, 5, '识别入库 · ' || COALESCE(NEW.name, '未命名'))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_product_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE was_complete boolean; is_complete boolean;
BEGIN
  is_complete := NEW.description IS NOT NULL AND length(trim(NEW.description)) > 0
                 AND NEW.selling_points IS NOT NULL AND jsonb_array_length(NEW.selling_points) > 0
                 AND NEW.tips IS NOT NULL AND length(trim(NEW.tips)) > 0;
  was_complete := OLD.description IS NOT NULL AND length(trim(OLD.description)) > 0
                  AND OLD.selling_points IS NOT NULL AND jsonb_array_length(OLD.selling_points) > 0
                  AND OLD.tips IS NOT NULL AND length(trim(OLD.tips)) > 0;
  IF is_complete AND NOT was_complete
     AND NEW.created_by IS NOT NULL
     AND NOT public.has_role(NEW.created_by, 'admin') THEN
    INSERT INTO public.exp_pending(user_id, source, source_ref, amount, title)
    VALUES (NEW.created_by, 'product_complete', NEW.id, 8, '资料补全 · ' || COALESCE(NEW.name, '未命名'))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_test_pass()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.passed_at IS NOT NULL
     AND (OLD.passed_at IS NULL OR OLD.passed_at IS DISTINCT FROM NEW.passed_at)
     AND NOT public.has_role(NEW.user_id, 'admin') THEN
    INSERT INTO public.exp_pending(user_id, source, source_ref, amount, title)
    VALUES (NEW.user_id, 'quiz_pass', NEW.id, 15, '通过知识测试')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_test_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.passed_at IS NOT NULL AND NOT public.has_role(NEW.user_id, 'admin') THEN
    INSERT INTO public.exp_pending(user_id, source, source_ref, amount, title)
    VALUES (NEW.user_id, 'quiz_pass', NEW.id, 15, '通过知识测试')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_post_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT public.has_role(NEW.user_id, 'admin') THEN
    INSERT INTO public.exp_pending(user_id, source, source_ref, amount, title)
    VALUES (NEW.user_id, 'post_insert', NEW.id, 5, '发布中古圈 · ' || COALESCE(NEW.name, '帖子'))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- 4. 领取函数
CREATE OR REPLACE FUNCTION public.claim_pending_exp(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  rec record;
  new_total int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.exp_pending
     SET claimed_at = now()
   WHERE id = _id AND user_id = uid AND claimed_at IS NULL
   RETURNING * INTO rec;
  IF rec.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_claimed');
  END IF;
  new_total := public.add_experience(uid, rec.amount);
  RETURN jsonb_build_object('ok', true, 'amount', rec.amount, 'total_exp', new_total);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_daily_task(_task_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  day_start timestamptz := (today::timestamp AT TIME ZONE 'Asia/Shanghai');
  day_end timestamptz := ((today + 1)::timestamp AT TIME ZONE 'Asia/Shanghai');
  amount int := 0;
  cnt int;
  new_total int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.task_claims WHERE user_id = uid AND task_key = _task_key AND claim_date = today) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  IF _task_key = 'daily_first_scan' THEN
    SELECT COUNT(*) INTO cnt FROM public.products
      WHERE created_by = uid AND created_at >= day_start AND created_at < day_end;
    IF cnt < 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'incomplete'); END IF;
    amount := 5;
  ELSIF _task_key = 'daily_3_scans' THEN
    SELECT COUNT(*) INTO cnt FROM public.products
      WHERE created_by = uid AND created_at >= day_start AND created_at < day_end;
    IF cnt < 3 THEN RETURN jsonb_build_object('ok', false, 'reason', 'incomplete'); END IF;
    amount := 10;
  ELSIF _task_key = 'daily_quiz' THEN
    SELECT COUNT(*) INTO cnt FROM public.knowledge_test_results
      WHERE user_id = uid AND passed_at IS NOT NULL AND passed_at >= day_start AND passed_at < day_end;
    IF cnt < 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'incomplete'); END IF;
    amount := 15;
  ELSIF _task_key = 'daily_post' THEN
    SELECT COUNT(*) INTO cnt FROM public.community_posts
      WHERE user_id = uid AND created_at >= day_start AND created_at < day_end;
    IF cnt < 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'incomplete'); END IF;
    amount := 5;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_task');
  END IF;

  INSERT INTO public.task_claims(user_id, task_key, claim_date, amount)
  VALUES (uid, _task_key, today, amount);

  new_total := public.add_experience(uid, amount);
  RETURN jsonb_build_object('ok', true, 'amount', amount, 'total_exp', new_total);
END; $$;

-- 5. Realtime
ALTER TABLE public.exp_pending REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exp_pending;
