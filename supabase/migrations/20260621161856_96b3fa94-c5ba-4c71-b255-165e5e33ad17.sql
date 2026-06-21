
create extension if not exists vector;

create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text,
  shop_id uuid references public.shops(id) on delete set null,
  scopes text[] not null default array['image','copy','video','chat']::text[],
  title text not null,
  content text not null,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  embed_model text,
  weight real not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kb_documents_source_idx on public.kb_documents(source_type, source_id);
create index kb_documents_shop_idx on public.kb_documents(shop_id);
create index kb_documents_scopes_idx on public.kb_documents using gin(scopes);
create index kb_documents_embedding_idx on public.kb_documents
  using hnsw (embedding vector_cosine_ops);

grant select, insert, update, delete on public.kb_documents to authenticated;
grant all on public.kb_documents to service_role;

alter table public.kb_documents enable row level security;

create policy "kb_documents admin all" on public.kb_documents for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "kb_documents staff read by shop" on public.kb_documents for select
  using (
    shop_id is null
    or exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.shop_id = public.kb_documents.shop_id
    )
  );

create trigger kb_documents_set_updated_at
  before update on public.kb_documents
  for each row execute function public.update_updated_at_column();

create table public.kb_ingest_queue (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  op text not null default 'upsert',
  payload jsonb,
  enqueued_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  error text
);

create index kb_ingest_queue_pending_idx on public.kb_ingest_queue(processed_at, enqueued_at)
  where processed_at is null;

grant select on public.kb_ingest_queue to authenticated;
grant all on public.kb_ingest_queue to service_role;

alter table public.kb_ingest_queue enable row level security;

create policy "kb_ingest_queue admin read" on public.kb_ingest_queue for select
  using (public.has_role(auth.uid(), 'admin'));

create table public.operation_okrs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  scope text not null default 'brand',
  shop_id uuid references public.shops(id) on delete set null,
  title text not null,
  objective text not null,
  key_results jsonb not null default '[]'::jsonb,
  key_actions text,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.operation_okrs to authenticated;
grant all on public.operation_okrs to service_role;

alter table public.operation_okrs enable row level security;

create policy "okrs admin all" on public.operation_okrs for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "okrs staff read" on public.operation_okrs for select
  using (
    scope = 'brand'
    or shop_id is null
    or exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.shop_id = public.operation_okrs.shop_id
    )
  );

create trigger okrs_set_updated_at
  before update on public.operation_okrs
  for each row execute function public.update_updated_at_column();

create or replace function public.match_kb(
  query_embedding vector(1536),
  match_count int default 6,
  scope_filter text default null,
  shop_filter uuid default null,
  min_similarity float default 0.55
)
returns table (
  id uuid, source_type text, source_id text, shop_id uuid,
  title text, content text, metadata jsonb, similarity float
)
language sql stable
security definer
set search_path = public
as $$
  select d.id, d.source_type, d.source_id, d.shop_id,
         d.title, d.content, d.metadata,
         (1 - (d.embedding <=> query_embedding)) * coalesce(d.weight, 1.0) as similarity
  from public.kb_documents d
  where d.embedding is not null
    and (scope_filter is null or scope_filter = any(d.scopes))
    and (shop_filter is null or d.shop_id is null or d.shop_id = shop_filter)
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 1) * 3
$$;

grant execute on function public.match_kb(vector, int, text, uuid, float) to authenticated, service_role;

create or replace function public.kb_enqueue(_source_type text, _source_id text, _op text default 'upsert')
returns void language sql security definer set search_path = public as $$
  insert into public.kb_ingest_queue(source_type, source_id, op)
  values (_source_type, _source_id, _op);
$$;

create or replace function public.kb_trigger_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
declare src_type text := TG_ARGV[0]; src_id text;
begin
  if TG_OP = 'DELETE' then
    src_id := OLD.id::text;
    perform public.kb_enqueue(src_type, src_id, 'delete');
    return OLD;
  else
    src_id := NEW.id::text;
    perform public.kb_enqueue(src_type, src_id, 'upsert');
    return NEW;
  end if;
end; $$;

create trigger kb_sync_official after insert or update or delete on public.official_knowledge
  for each row execute function public.kb_trigger_enqueue('official');
create trigger kb_sync_product_kb after insert or update or delete on public.product_knowledge
  for each row execute function public.kb_trigger_enqueue('product_kb');
create trigger kb_sync_shops after insert or update or delete on public.shops
  for each row execute function public.kb_trigger_enqueue('shop');
create trigger kb_sync_shop_profile after insert or update or delete on public.shop_marketing_profiles
  for each row execute function public.kb_trigger_enqueue('shop_profile');
create trigger kb_sync_shop_kb after insert or update or delete on public.shop_kb_entries
  for each row execute function public.kb_trigger_enqueue('shop_kb');
create trigger kb_sync_presets after insert or update or delete on public.marketing_presets
  for each row execute function public.kb_trigger_enqueue('preset');
create trigger kb_sync_assets after insert or update or delete on public.marketing_assets
  for each row execute function public.kb_trigger_enqueue('asset');
create trigger kb_sync_characters after insert or update or delete on public.marketing_characters
  for each row execute function public.kb_trigger_enqueue('character');
create trigger kb_sync_okrs after insert or update or delete on public.operation_okrs
  for each row execute function public.kb_trigger_enqueue('okr');

create or replace function public.kb_trigger_community()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    perform public.kb_enqueue('community', OLD.id::text, 'delete');
    return OLD;
  end if;
  if coalesce(NEW.is_featured, false) then
    perform public.kb_enqueue('community', NEW.id::text, 'upsert');
  else
    perform public.kb_enqueue('community', NEW.id::text, 'delete');
  end if;
  return NEW;
end; $$;

create trigger kb_sync_community after insert or update or delete on public.community_posts
  for each row execute function public.kb_trigger_community();

create or replace function public.kb_trigger_products()
returns trigger language plpgsql security definer set search_path = public as $$
declare complete boolean;
begin
  if TG_OP = 'DELETE' then
    perform public.kb_enqueue('product', OLD.id::text, 'delete');
    return OLD;
  end if;
  complete := NEW.description is not null and length(trim(NEW.description)) > 0
              and NEW.selling_points is not null and jsonb_array_length(NEW.selling_points) > 0;
  if complete then
    perform public.kb_enqueue('product', NEW.id::text, 'upsert');
  end if;
  return NEW;
end; $$;

create trigger kb_sync_products after insert or update or delete on public.products
  for each row execute function public.kb_trigger_products();
