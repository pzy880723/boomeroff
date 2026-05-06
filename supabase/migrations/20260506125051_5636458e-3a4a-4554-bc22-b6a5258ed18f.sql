CREATE TABLE public.knowledge_test_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('favorite','knowledge')),
  item_id uuid NOT NULL,
  source_type text,
  source_id uuid,
  passed_at timestamp with time zone,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_kind, item_id)
);

CREATE INDEX idx_ktr_user ON public.knowledge_test_results(user_id);
CREATE INDEX idx_ktr_user_passed ON public.knowledge_test_results(user_id, passed_at);

ALTER TABLE public.knowledge_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own test results"
  ON public.knowledge_test_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own test results"
  ON public.knowledge_test_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own test results"
  ON public.knowledge_test_results FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own test results"
  ON public.knowledge_test_results FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ktr_updated_at
  BEFORE UPDATE ON public.knowledge_test_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();