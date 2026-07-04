## 问题

点「分享到 BOOMER 圈」时 toast 报 `record "new" has no field "is_featured"`。

根因:数据库触发器 `kb_trigger_community`(建在 `community_posts` 上,把优质帖子灌进知识库 RAG)引用了 `NEW.is_featured`,但表里从来没有 `is_featured` 列 —— 只有 `is_public`。所以任何 INSERT / UPDATE `community_posts` 都会被这个触发器炸掉,分享全线失败。

## 修复

用 migration 重写 `public.kb_trigger_community()`,把 `NEW.is_featured` 换成 `coalesce(NEW.is_public, false)`。语义等价于「公开的帖子入 KB,非公开的从 KB 里删掉」,和现在的分享按钮(始终写 `is_public: true`)以及 admin 审核撤下(设为 false)完全对得上。

```sql
CREATE OR REPLACE FUNCTION public.kb_trigger_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if TG_OP = 'DELETE' then
    perform public.kb_enqueue('community', OLD.id::text, 'delete');
    return OLD;
  end if;
  if coalesce(NEW.is_public, false) then
    perform public.kb_enqueue('community', NEW.id::text, 'upsert');
  else
    perform public.kb_enqueue('community', NEW.id::text, 'delete');
  end if;
  return NEW;
end;
$$;
```

## 验证

修完之后在 /scan 拍一张图 → 点「分享到 BOOMER 圈」应该正常提示「已分享到 BOOMER 圈」,不再报 is_featured 错误;去 BOOMER 圈 feed 能看到这条新帖。

## 不改动

- `community_posts` 表结构、RLS、grants 全部不动
- 前端 `ShareToCommunityButton.tsx` 不动 —— 逻辑本来就是对的
- 其它 `kb_trigger_*` 触发器不动