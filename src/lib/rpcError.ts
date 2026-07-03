// 统一 PostgREST / RPC / DB 错误 -> 中文可读信息 + 分类
// 用于列表页/详情页面对权限错误时，展示友好提示与重试入口。

export type RpcErrorKind =
  | 'permission'   // 权限不足（RLS / GRANT / 角色）
  | 'not_found'    // 记录不存在
  | 'auth'         // 未登录 / 登录过期
  | 'network'      // 网络/超时
  | 'unknown';

export interface FriendlyRpcError {
  kind: RpcErrorKind;
  message: string;
  raw?: string;
}

export function humanizeRpcError(err: any): FriendlyRpcError {
  if (!err) return { kind: 'unknown', message: '操作失败，请稍后再试' };
  const raw = (err.message || err.error || String(err) || '').toString();
  const low = raw.toLowerCase();
  const code = err.code || err.status || '';

  // 权限类
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    low.includes('permission denied') ||
    low.includes('forbidden') ||
    low.includes('not authorized') ||
    low.includes('rls') ||
    low.includes('row-level security') ||
    low.includes('policy')
  ) {
    return { kind: 'permission', message: '你当前的角色没有查看此内容的权限', raw };
  }

  // 未登录
  if (
    code === '401' ||
    low.includes('jwt') ||
    low.includes('not authenticated') ||
    low.includes('unauthorized')
  ) {
    return { kind: 'auth', message: '登录已过期，请重新登录后再试', raw };
  }

  // 记录不存在
  if (code === 'PGRST116' || low.includes('no rows') || low.includes('not found')) {
    return { kind: 'not_found', message: '记录不存在或已被删除', raw };
  }

  // 网络
  if (
    low.includes('failed to fetch') ||
    low.includes('networkerror') ||
    low.includes('timeout') ||
    low === 'load failed'
  ) {
    return { kind: 'network', message: '网络连接异常，请检查网络后重试', raw };
  }

  return { kind: 'unknown', message: '数据加载失败，请稍后重试', raw };
}
