
ALTER TABLE public.marketing_video_jobs
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'volcengine_seedance',
  ADD COLUMN IF NOT EXISTS provider_task_id text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mvj_provider_task ON public.marketing_video_jobs(provider_task_id);

-- 把旧版本残留的 queued 任务标记为 failed
UPDATE public.marketing_video_jobs
   SET status = 'failed',
       error = '旧版本未真实渲染,请重新生成'
 WHERE status IN ('queued','running')
   AND provider_task_id IS NULL;

UPDATE public.marketing_assets
   SET meta = jsonb_set(
     COALESCE(meta, '{}'::jsonb),
     '{status}',
     '"failed"'::jsonb
   )
 WHERE kind = 'video'
   AND COALESCE(meta->>'status','') IN ('queued','running')
   AND output_url IS NULL;
