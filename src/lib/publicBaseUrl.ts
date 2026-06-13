// 对外部署域名：海报二维码/分享链接的根 URL。
// 管理员在 /portal → 系统 → 部署设置 里配置；为空则回退当前 origin。
import { supabase } from '@/integrations/supabase/client';

const LS_KEY = 'public_base_url_v1';
let memCache: string | null = null;
let loaded = false;

function normalize(u: string): string {
  let s = (u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.replace(/\/+$/, '');
}

export function getPublicBaseUrl(): string {
  if (memCache === null) {
    try { memCache = localStorage.getItem(LS_KEY) || ''; } catch { memCache = ''; }
  }
  const v = normalize(memCache || '');
  if (v) return v;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export async function loadPublicBaseUrl(): Promise<string> {
  if (loaded) return getPublicBaseUrl();
  loaded = true;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'public_base_url')
      .maybeSingle();
    const raw = (data?.value as any);
    const url = typeof raw === 'string' ? raw : (raw?.url || '');
    memCache = normalize(url || '');
    try { localStorage.setItem(LS_KEY, memCache); } catch { /* noop */ }
  } catch { /* offline / not logged in: keep ls cache */ }
  return getPublicBaseUrl();
}

export async function savePublicBaseUrl(url: string): Promise<void> {
  const v = normalize(url);
  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key: 'public_base_url', value: { url: v } as any, updated_at: new Date().toISOString() }]);
  if (error) throw error;
  memCache = v;
  try { localStorage.setItem(LS_KEY, v); } catch { /* noop */ }
}
