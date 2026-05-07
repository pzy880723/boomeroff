
-- Tables
CREATE TABLE public.user_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  check_in_date date NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  streak int NOT NULL DEFAULT 1,
  exp_gained int NOT NULL DEFAULT 0,
  UNIQUE (user_id, check_in_date)
);
CREATE INDEX idx_user_check_ins_user_date ON public.user_check_ins(user_id, check_in_date DESC);
ALTER TABLE public.user_check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own check-ins" ON public.user_check_ins FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own check-ins" ON public.user_check_ins FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_experience (
  user_id uuid PRIMARY KEY,
  total_exp int NOT NULL DEFAULT 0,
  current_streak int NOT NULL DEFAULT 0,
  longest_streak int NOT NULL DEFAULT 0,
  last_check_in_date date,
  total_check_ins int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Experience readable by authenticated" ON public.user_experience FOR SELECT TO authenticated USING (true);

-- add_experience: idempotent helper. Returns new total_exp.
CREATE OR REPLACE FUNCTION public.add_experience(_user_id uuid, _amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount = 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.user_experience (user_id, total_exp, updated_at)
  VALUES (_user_id, _amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET total_exp = public.user_experience.total_exp + EXCLUDED.total_exp,
        updated_at = now()
  RETURNING total_exp INTO new_total;
  RETURN new_total;
END;
$$;

-- perform_check_in: signs in current auth.uid() for today
CREATE OR REPLACE FUNCTION public.perform_check_in()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  last_date date;
  cur_streak int;
  longest int;
  new_streak int;
  base_exp int := 10;
  bonus int := 0;
  total_gain int;
  new_total int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_check_ins WHERE user_id = uid AND check_in_date = today) THEN
    RETURN jsonb_build_object('already', true);
  END IF;

  SELECT last_check_in_date, current_streak, longest_streak
    INTO last_date, cur_streak, longest
  FROM public.user_experience WHERE user_id = uid;

  IF last_date IS NULL THEN
    new_streak := 1;
  ELSIF last_date = today - 1 THEN
    new_streak := COALESCE(cur_streak, 0) + 1;
  ELSE
    new_streak := 1;
  END IF;

  IF new_streak % 30 = 0 THEN bonus := 50;
  ELSIF new_streak % 7 = 0 THEN bonus := 15;
  ELSIF new_streak % 3 = 0 THEN bonus := 5;
  END IF;
  total_gain := base_exp + bonus;

  INSERT INTO public.user_check_ins (user_id, check_in_date, streak, exp_gained)
  VALUES (uid, today, new_streak, total_gain);

  INSERT INTO public.user_experience (user_id, total_exp, current_streak, longest_streak, last_check_in_date, total_check_ins, updated_at)
  VALUES (uid, total_gain, new_streak, GREATEST(new_streak, 1), today, 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET total_exp = public.user_experience.total_exp + EXCLUDED.total_exp,
        current_streak = EXCLUDED.current_streak,
        longest_streak = GREATEST(public.user_experience.longest_streak, EXCLUDED.current_streak),
        last_check_in_date = EXCLUDED.last_check_in_date,
        total_check_ins = public.user_experience.total_check_ins + 1,
        updated_at = now()
  RETURNING total_exp INTO new_total;

  RETURN jsonb_build_object(
    'already', false,
    'exp_gained', total_gain,
    'bonus', bonus,
    'current_streak', new_streak,
    'total_exp', new_total
  );
END;
$$;

-- Trigger functions for multi-dimension exp
CREATE OR REPLACE FUNCTION public.exp_on_product_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.add_experience(NEW.created_by, 15);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_exp_product AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.exp_on_product_insert();

CREATE OR REPLACE FUNCTION public.exp_on_official_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.source_product_id IS NOT NULL THEN
    SELECT created_by INTO owner FROM public.products WHERE id = NEW.source_product_id;
    IF owner IS NOT NULL THEN
      PERFORM public.add_experience(owner, 30);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_exp_official AFTER INSERT ON public.official_knowledge
FOR EACH ROW EXECUTE FUNCTION public.exp_on_official_insert();

CREATE OR REPLACE FUNCTION public.exp_on_post_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.add_experience(NEW.user_id, 5);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_exp_post AFTER INSERT ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.exp_on_post_insert();

CREATE OR REPLACE FUNCTION public.exp_on_like_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT user_id INTO author FROM public.community_posts WHERE id = NEW.post_id;
  IF author IS NOT NULL AND author <> NEW.user_id THEN
    PERFORM public.add_experience(author, 2);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_exp_like AFTER INSERT ON public.community_likes
FOR EACH ROW EXECUTE FUNCTION public.exp_on_like_insert();

CREATE OR REPLACE FUNCTION public.exp_on_comment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT user_id INTO author FROM public.community_posts WHERE id = NEW.post_id;
  IF author IS NOT NULL AND author <> NEW.user_id THEN
    PERFORM public.add_experience(author, 3);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_exp_comment AFTER INSERT ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.exp_on_comment_insert();

CREATE OR REPLACE FUNCTION public.exp_on_test_pass()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.passed_at IS NOT NULL AND (OLD.passed_at IS NULL OR OLD.passed_at IS DISTINCT FROM NEW.passed_at) THEN
    PERFORM public.add_experience(NEW.user_id, 10);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_exp_test_pass AFTER UPDATE ON public.knowledge_test_results
FOR EACH ROW EXECUTE FUNCTION public.exp_on_test_pass();

CREATE OR REPLACE FUNCTION public.exp_on_test_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.passed_at IS NOT NULL THEN
    PERFORM public.add_experience(NEW.user_id, 10);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_exp_test_insert AFTER INSERT ON public.knowledge_test_results
FOR EACH ROW EXECUTE FUNCTION public.exp_on_test_insert();
