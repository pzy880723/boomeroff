import { supabase } from '@/integrations/supabase/client';

export type AuditAction =
  | 'login.password'
  | 'login.phone'
  | 'logout'
  | 'phone.bind'
  | 'user.create'
  | 'user.delete'
  | 'user.suspend'
  | 'user.resume'
  | 'user.reset_password'
  | 'user.update_role'
  | 'user.update_profile';

interface LogParams {
  action: AuditAction;
  target_type?: string;
  target_id?: string;
  detail?: Record<string, any>;
}

let cachedUa: string | null = null;
function ua() {
  if (cachedUa !== null) return cachedUa;
  try { cachedUa = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : ''; }
  catch { cachedUa = ''; }
  return cachedUa;
}

/** 写入一条审计日志。失败不抛异常，只在控制台警告。 */
export async function logAudit({ action, target_type, target_id, detail }: LogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('audit_logs' as any).insert({
      user_id: user.id,
      action,
      target_type: target_type ?? null,
      target_id: target_id ?? null,
      detail: detail ?? {},
      user_agent: ua(),
    });
  } catch (e) {
    console.warn('[audit] failed', e);
  }
}
