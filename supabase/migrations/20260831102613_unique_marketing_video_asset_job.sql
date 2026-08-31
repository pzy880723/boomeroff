-- One rendered marketing video job must map to exactly one material-library row.
-- Historical poll requests could backfill a second row under the viewer's user_id.

with grouped as (
  select
    a.meta->>'job_id' as job_id,
    (array_agg(
      a.id
      order by coalesce(a.user_id = j.user_id, false) desc, a.created_at asc, a.id asc
    ))[1] as keep_id,
    (array_agg(
      a.output_url
      order by (a.output_url is not null) desc, a.created_at desc, a.id desc
    ))[1] as best_output_url,
    coalesce(
      nullif(j.fallback_notes->'cover_generation'->>'cover_url', ''),
      (array_agg(
        nullif(a.meta->>'cover_url', '')
        order by coalesce(a.meta->>'cover_source' = 'seedream-worker', false) desc,
          a.created_at desc,
          a.id desc
      ))[1]
    ) as best_cover_url
  from public.marketing_assets a
  left join public.marketing_video_jobs j
    on j.id::text = a.meta->>'job_id'
  where a.kind = 'video'
    and coalesce(a.meta->>'job_id', '') <> ''
  group by a.meta->>'job_id', j.user_id, j.fallback_notes
), repaired as (
  update public.marketing_assets a
  set
    output_url = coalesce(a.output_url, grouped.best_output_url),
    meta = coalesce(a.meta, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'cover_url', grouped.best_cover_url,
        'poster_url', grouped.best_cover_url,
        'cover_source', case when grouped.best_cover_url is not null then 'seedream-worker' else null end
      ))
  from grouped
  where a.id = grouped.keep_id
  returning a.id
), ranked as (
  select
    a.id,
    row_number() over (
      partition by a.meta->>'job_id'
      order by coalesce(a.user_id = j.user_id, false) desc, a.created_at asc, a.id asc
    ) as row_no
  from public.marketing_assets a
  left join public.marketing_video_jobs j
    on j.id::text = a.meta->>'job_id'
  where a.kind = 'video'
    and coalesce(a.meta->>'job_id', '') <> ''
)
delete from public.marketing_assets a
using ranked
where a.id = ranked.id
  and ranked.row_no > 1;

create unique index if not exists marketing_assets_one_video_per_job
  on public.marketing_assets ((meta->>'job_id'))
  where kind = 'video'
    and coalesce(meta->>'job_id', '') <> '';
