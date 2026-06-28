UPDATE public.marketing_video_jobs p
   SET status = 'failed',
       error = '旧版视频任务在提交分段时被系统中断，请重新生成',
       last_polled_at = now()
 WHERE p.parent_job_id IS NULL
   AND p.provider_task_id IS NULL
   AND p.status IN ('queued','running','rendering')
   AND p.created_at < now() - interval '10 minutes'
   AND NOT EXISTS (
     SELECT 1 FROM public.marketing_video_jobs c WHERE c.parent_job_id = p.id
   );

UPDATE public.marketing_assets a
   SET meta = jsonb_set(
       jsonb_set(COALESCE(a.meta, '{}'::jsonb), '{status}', '"failed"'::jsonb, true),
       '{error}', '"旧版视频任务在提交分段时被系统中断，请重新生成"'::jsonb, true
     )
 WHERE a.kind = 'video'
   AND COALESCE(a.meta->>'status','') IN ('queued','running','rendering')
   AND EXISTS (
     SELECT 1 FROM public.marketing_video_jobs p
      WHERE p.id::text = a.meta->>'job_id'
        AND p.status = 'failed'
        AND p.error = '旧版视频任务在提交分段时被系统中断，请重新生成'
   );