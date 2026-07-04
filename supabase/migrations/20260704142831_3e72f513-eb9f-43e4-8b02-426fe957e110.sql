CREATE OR REPLACE FUNCTION public.kb_trigger_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;