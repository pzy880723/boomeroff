
DROP FUNCTION IF EXISTS public.exp_on_official_insert() CASCADE;

CREATE OR REPLACE FUNCTION public.exp_on_product_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND NOT public.has_role(NEW.created_by, 'admin') THEN
    PERFORM public.add_experience(NEW.created_by, 5);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_post_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT public.has_role(NEW.user_id, 'admin') THEN
    PERFORM public.add_experience(NEW.user_id, 5);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_like_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT user_id INTO author FROM public.community_posts WHERE id = NEW.post_id;
  IF author IS NOT NULL AND author <> NEW.user_id AND NOT public.has_role(author, 'admin') THEN
    PERFORM public.add_experience(author, 2);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_comment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT user_id INTO author FROM public.community_posts WHERE id = NEW.post_id;
  IF author IS NOT NULL AND author <> NEW.user_id AND NOT public.has_role(author, 'admin') THEN
    PERFORM public.add_experience(author, 3);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_test_pass()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.passed_at IS NOT NULL
     AND (OLD.passed_at IS NULL OR OLD.passed_at IS DISTINCT FROM NEW.passed_at)
     AND NOT public.has_role(NEW.user_id, 'admin') THEN
    PERFORM public.add_experience(NEW.user_id, 15);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_test_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.passed_at IS NOT NULL AND NOT public.has_role(NEW.user_id, 'admin') THEN
    PERFORM public.add_experience(NEW.user_id, 15);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.exp_on_favorite_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE today_count int;
BEGIN
  IF NEW.user_id IS NULL OR public.has_role(NEW.user_id, 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO today_count FROM public.user_favorites
    WHERE user_id = NEW.user_id
      AND created_at >= ((now() AT TIME ZONE 'Asia/Shanghai')::date)::timestamp AT TIME ZONE 'Asia/Shanghai';
  IF today_count <= 5 THEN
    PERFORM public.add_experience(NEW.user_id, 1);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_exp_favorite_insert ON public.user_favorites;
CREATE TRIGGER trg_exp_favorite_insert
AFTER INSERT ON public.user_favorites
FOR EACH ROW EXECUTE FUNCTION public.exp_on_favorite_insert();

CREATE OR REPLACE FUNCTION public.exp_on_product_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    PERFORM public.add_experience(NEW.created_by, 8);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_exp_product_complete ON public.products;
CREATE TRIGGER trg_exp_product_complete
AFTER UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.exp_on_product_complete();

CREATE OR REPLACE FUNCTION public.perform_check_in()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  last_date date; cur_streak int; longest int; new_streak int;
  base_exp int := 3; bonus int := 0; total_gain int; new_total int;
  is_admin boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_check_ins WHERE user_id = uid AND check_in_date = today) THEN
    RETURN jsonb_build_object('already', true);
  END IF;

  SELECT last_check_in_date, current_streak, longest_streak INTO last_date, cur_streak, longest
  FROM public.user_experience WHERE user_id = uid;

  IF last_date IS NULL THEN new_streak := 1;
  ELSIF last_date = today - 1 THEN new_streak := COALESCE(cur_streak, 0) + 1;
  ELSE new_streak := 1; END IF;

  IF new_streak % 30 = 0 THEN bonus := 30;
  ELSIF new_streak % 7 = 0 THEN bonus := 10;
  ELSIF new_streak % 3 = 0 THEN bonus := 3;
  END IF;

  is_admin := public.has_role(uid, 'admin');
  total_gain := CASE WHEN is_admin THEN 0 ELSE base_exp + bonus END;

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

  RETURN jsonb_build_object('already', false, 'exp_gained', total_gain, 'bonus', bonus,
                            'current_streak', new_streak, 'total_exp', new_total, 'is_admin', is_admin);
END; $$;
