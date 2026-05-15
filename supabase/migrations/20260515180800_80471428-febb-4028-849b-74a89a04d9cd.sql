-- 删除闲鱼行情功能相关数据
DROP TABLE IF EXISTS public.xianyu_price_snapshots CASCADE;
DELETE FROM public.app_role_permissions WHERE permission_key = 'xianyu.manage';
DELETE FROM public.app_permissions WHERE key = 'xianyu.manage';