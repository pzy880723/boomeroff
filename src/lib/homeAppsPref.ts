const KEY = 'boomer_go_home_apps_v1';

export type AppPref = { order: string[]; hidden: string[] };

const DEFAULT_ORDER = [
  'scan', 'library', 'vouchers', 'marketing',
  'okr', 'my-kb', 'schedule', 'community',
];

export function readAppPref(): AppPref {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { order: DEFAULT_ORDER, hidden: [] };
    const p = JSON.parse(raw);
    return {
      order: Array.isArray(p.order) && p.order.length ? p.order : DEFAULT_ORDER,
      hidden: Array.isArray(p.hidden) ? p.hidden : [],
    };
  } catch {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
}

export function writeAppPref(p: AppPref) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export const DEFAULT_APP_ORDER = DEFAULT_ORDER;
