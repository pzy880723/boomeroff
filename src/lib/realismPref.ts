import { DEFAULT_REALISM, type Realism } from './realism';

const KEY = 'boomer.realism';

export function getRealismPref(): Realism {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'photoreal' ? 'photoreal' : DEFAULT_REALISM;
  } catch {
    return DEFAULT_REALISM;
  }
}

export function setRealismPref(r: Realism) {
  try { localStorage.setItem(KEY, r); } catch {}
}
