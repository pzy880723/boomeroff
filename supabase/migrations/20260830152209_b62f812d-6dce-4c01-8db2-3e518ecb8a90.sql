with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, shop_id
      order by created_at desc, id desc
    ) as row_no
  from public.video_generation_jobs
  where status in ('script_generating', 'script_ready')
    and meta->>'flow' = 'surprise'
    and coalesce(meta->>'consumed', 'false') = 'false'
)
update public.video_generation_jobs as job
set
  status = 'failed',
  error_message = '重复脚本任务已由较新任务接管',
  meta = coalesce(job.meta, '{}'::jsonb)
    || jsonb_build_object(
      'flow', 'surprise',
      'consumed', false,
      'surprise_stage', 'failed',
      'duplicate_retired_at', now()
    )
from ranked
where ranked.id = job.id
  and ranked.row_no > 1;

create unique index if not exists video_generation_jobs_one_active_surprise_script
  on public.video_generation_jobs (user_id, shop_id)
  where status in ('script_generating', 'script_ready')
    and meta->>'flow' = 'surprise'
    and coalesce(meta->>'consumed', 'false') = 'false';