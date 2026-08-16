alter table public.shops
  add column if not exists business_hours text not null default '每天 10:00–22:00';

comment on column public.shops.business_hours is
  '门店固定营业时间，由服务端拼接到发布文案，禁止视频文案模型自行生成';
