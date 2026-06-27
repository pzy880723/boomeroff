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
  if (low.includes('non-2xx status code') || low.includes('non 2xx')) {
    return '服务暂时不可用，请稍后再试';
  }
  if (low.includes('cors')) {
    return '网络受限，请稍后再试';
  }
  if (low === 'load failed') {
    return '网络连接异常，请检查网络后重试';
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
