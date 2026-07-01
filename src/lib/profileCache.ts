// SWR-style session cache for the /me page. Keeps first paint at ~0ms on
// repeat visits and never blocks background refresh from Supabase.

export interface MeProfileCache {
  displayName: string;
  avatarUrl: string | null;
  realName: string | null;
  position: string | null;
  shopName: string | null;
  totalExp: number;
  stats: { scans: number; favs: number; posts: number };
  updatedAt: number;
}

const KEY = (uid: string) => `me:profile:${uid}`;

export function readMeCache(uid: string): Partial<MeProfileCache> | null {
  try {
    const raw = sessionStorage.getItem(KEY(uid));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeMeCache(uid: string, patch: Partial<MeProfileCache>) {
  try {
    const prev = readMeCache(uid) || {};
    const merged = { ...prev, ...patch, updatedAt: Date.now() };
    sessionStorage.setItem(KEY(uid), JSON.stringify(merged));
  } catch {
    // ignore quota errors
  }
}

// Preload the avatar image so the next /me visit hits the browser cache
// even before React renders the <img>.
export function preloadAvatar(url: string | null | undefined) {
  if (!url || typeof document === 'undefined') return;
  if (document.head.querySelector(`link[data-avatar-preload="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  link.setAttribute('data-avatar-preload', url);
  document.head.appendChild(link);
}
