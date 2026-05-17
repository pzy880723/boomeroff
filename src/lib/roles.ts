// 角色映射：新角色 code → 旧 app_role enum
// 同时被前端 UserTable 和 edge function admin-create-user 使用（edge function 内联同样逻辑）
export const ADMIN_ROLE_CODES = ['super_admin', 'area_manager', 'shop_manager'] as const;

export function legacyRoleOf(code: string): 'admin' | 'anchor' {
  return (ADMIN_ROLE_CODES as readonly string[]).includes(code) ? 'admin' : 'anchor';
}
