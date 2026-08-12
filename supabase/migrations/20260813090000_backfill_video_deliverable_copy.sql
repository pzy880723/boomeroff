-- 固化历史成片的发布文案。素材库是公司内共享读取的，而生成任务只允许
-- 创建人读取；文案必须随成片一起落在 marketing_assets，不能依赖详情页回查任务。

with source as (
  select
    a.id,
    j.script -> 'publish_copy' as publish_copy
  from public.marketing_assets a
  join public.marketing_video_jobs j
    on j.id::text = a.meta ->> 'job_id'
  where a.kind = 'video'
    and jsonb_typeof(j.script -> 'publish_copy') = 'object'
), normalized as (
  select
    id,
    publish_copy,
    jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(publish_copy ->> 'title', publish_copy ->> 'cover_title'),
      'body', coalesce(publish_copy ->> 'body', publish_copy ->> 'caption', publish_copy ->> 'douyin_caption'),
      'hashtags', coalesce(publish_copy -> 'hashtags', publish_copy -> 'topics', '[]'::jsonb),
      'first_comment', publish_copy ->> 'first_comment'
    )) as video_copy
  from source
)
update public.marketing_assets a
set
  meta = coalesce(a.meta, '{}'::jsonb)
    || jsonb_build_object(
      'publish_copy', coalesce(a.meta -> 'publish_copy', n.publish_copy),
      'video_copy', coalesce(a.meta -> 'video_copy', n.video_copy)
    ),
  output_text = coalesce(
    nullif(a.output_text, ''),
    n.video_copy ->> 'body',
    n.video_copy ->> 'title'
  )
from normalized n
where a.id = n.id
  and (a.meta -> 'video_copy' is null or nullif(a.output_text, '') is null);

with source as (
  select
    a.id,
    coalesce(j.meta -> 'publish_copy', j.script_json -> 'publish_copy') as publish_copy
  from public.marketing_assets a
  join public.video_generation_jobs j
    on j.id::text = a.meta ->> 'director_job_id'
  where a.kind = 'video'
    and jsonb_typeof(coalesce(j.meta -> 'publish_copy', j.script_json -> 'publish_copy')) = 'object'
), normalized as (
  select
    id,
    publish_copy,
    jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(publish_copy ->> 'title', publish_copy ->> 'cover_title'),
      'body', coalesce(publish_copy ->> 'body', publish_copy ->> 'caption', publish_copy ->> 'douyin_caption'),
      'hashtags', coalesce(publish_copy -> 'hashtags', publish_copy -> 'topics', '[]'::jsonb),
      'first_comment', publish_copy ->> 'first_comment'
    )) as video_copy
  from source
)
update public.marketing_assets a
set
  meta = coalesce(a.meta, '{}'::jsonb)
    || jsonb_build_object(
      'publish_copy', coalesce(a.meta -> 'publish_copy', n.publish_copy),
      'video_copy', coalesce(a.meta -> 'video_copy', n.video_copy)
    ),
  output_text = coalesce(
    nullif(a.output_text, ''),
    n.video_copy ->> 'body',
    n.video_copy ->> 'title'
  )
from normalized n
where a.id = n.id
  and (a.meta -> 'video_copy' is null or nullif(a.output_text, '') is null);
