// 统一的 edge function 调用封装：
// - 把 supabase-js 的 FunctionsHttpError 的响应体读出来，拿到后端真正的中文错误
// - 把网络层的英文报错翻译成人话
import { supabase } from '@/integrations/supabase/client';

export interface InvokeResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function humanize(raw: string | undefined | null): string {
  const msg = (raw || '').trim();
  if (!msg) return '操作失败，请稍后再试';
  const low = msg.toLowerCase();
  if (low.includes('failed to fetch') || low.includes('networkerror') || low.includes('network request failed')) {
    return '网络连接异常，请检查网络后重试';
  }
  if (low.includes('timeout') || low.includes('timed out')) {
    return '服务器响应超时，请稍后再试';
  }
  if (low.includes('worker_resource_limit') || low.includes('not having enough compute') || low.includes('compute resources')) {
    return '渲染服务繁忙，系统已自动重试，请稍后再试一次';
  }
  if (low.includes('worker_limit') || low.includes('cpu time') || low.includes('wall clock')) {
    return '本次任务耗时过长，已自动中断，请稍后重试';
  }
  if (low.includes('early_drop') || low.includes('earlydrop')) {
    return '服务连接被中断，请稍后再试';
  }
  if (low.includes('runtime_error') || low.includes('runtime error')) {
    return '服务运行异常，已记录，请稍后再试';
  }
  if (low.includes('boot_failure') || low.includes('boot error')) {
    return '服务启动失败，请稍后再试';
  }
  if (low.includes('non-2xx status code') || low.includes('non 2xx') || low.includes('non-2xx')) {
    return '服务暂时不可用，请稍后再试';
  }
  if (low.includes('cors')) {
    return '网络受限，请稍后再试';
  }
  if (low.includes('unauthorized') || low.includes('401')) {
    return '登录已过期，请重新登录';
  }
  if (low.includes('forbidden') || low.includes('403')) {
    return '没有访问权限';
  }
  if (low.includes('not found') && low.length < 80) {
    return '服务不存在或已下线';
  }
  if (low.includes('500') && low.includes('internal')) {
    return '服务内部错误，请稍后再试';
  }
  if (low.includes('502') || low.includes('bad gateway') || low.includes('503') || low.includes('service unavailable') || low.includes('504')) {
    return '服务暂时不可用，请稍后再试';
  }
  if (low === 'load failed') {
    return '网络连接异常，请检查网络后重试';
  }
  // 完全是英文且看起来像技术堆栈/错误码的 → 兜底中文
  if (/^[\x00-\x7F\s]+$/.test(msg) && /[a-zA-Z]/.test(msg) && msg.length > 50) {
    return '服务暂时异常，请稍后再试';
  }
  return msg;
}

export async function invokeFn<T = any>(
  name: string,
  options?: Parameters<typeof supabase.functions.invoke>[1],
): Promise<InvokeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(name, options);

    // 后端 200 但 body 里带 { error } 的业务错误
    if (data && typeof data === 'object' && (data as any).error) {
      return { data: null, error: { message: humanize(String((data as any).error)) } };
    }

    if (error) {
      // FunctionsHttpError: 含 context (Response)
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.clone === 'function') {
        try {
          const body = await ctx.clone().json();
          // 后端用 4xx 明确回传业务标记(如 expired) —— 当作数据返回,方便调用方分支处理
          if (body && typeof body === 'object' && ('expired' in body || 'code' in body)) {
            return { data: body as T, error: null };
          }
          const serverMsg = body?.error || body?.message;
          if (serverMsg) return { data: null, error: { message: humanize(String(serverMsg)) } };
        } catch {
          // body 不是 JSON，尝试 text
          try {
            const txt = await ctx.clone().text();
            if (txt) return { data: null, error: { message: humanize(txt) } };
          } catch { /* ignore */ }
        }
      }
      return { data: null, error: { message: humanize(error.message) } };
    }

    return { data: (data as T) ?? null, error: null };
  } catch (e: any) {
    return { data: null, error: { message: humanize(e?.message || String(e)) } };
  }
}
