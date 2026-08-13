-- shop_marketing_profiles uses shop_id as its primary key. The generic KB
-- trigger previously accessed NEW.id directly, which aborted profile saves.
create or replace function public.kb_trigger_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  src_type text := TG_ARGV[0];
  row_data jsonb;
  src_id text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  src_id := coalesce(row_data ->> 'id', row_data ->> 'shop_id');

  if src_id is null then
    raise exception 'kb_trigger_enqueue: table % has neither id nor shop_id', TG_TABLE_NAME;
  end if;

  perform public.kb_enqueue(
    src_type,
    src_id,
    case when TG_OP = 'DELETE' then 'delete' else 'upsert' end
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
