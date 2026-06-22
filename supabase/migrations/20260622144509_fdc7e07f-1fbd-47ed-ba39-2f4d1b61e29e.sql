
-- 1) exp_pending: 禁止所有客户端写入（只允许 service_role / SECURITY DEFINER 触发器）
CREATE POLICY "deny_client_insert_exp_pending"
  ON public.exp_pending AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);
CREATE POLICY "deny_client_update_exp_pending"
  ON public.exp_pending AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "deny_client_delete_exp_pending"
  ON public.exp_pending AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- 2) task_claims: 同上，所有写入只能走 claim_daily_task RPC
CREATE POLICY "deny_client_insert_task_claims"
  ON public.task_claims AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);
CREATE POLICY "deny_client_update_task_claims"
  ON public.task_claims AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "deny_client_delete_task_claims"
  ON public.task_claims AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- 3) user_experience: 同上，所有写入只能走 add_experience / perform_check_in
CREATE POLICY "deny_client_insert_user_experience"
  ON public.user_experience AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);
CREATE POLICY "deny_client_update_user_experience"
  ON public.user_experience AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "deny_client_delete_user_experience"
  ON public.user_experience AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);
