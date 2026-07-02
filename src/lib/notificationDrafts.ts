// 通知撰稿草稿箱 - localStorage 存储
export interface NotificationDraft {
  id: string;
  title: string;
  body: string;
  type: string;
  category: 'notice' | 'news' | 'message';
  coverUrl: string;
  updatedAt: string;
}

const KEY = 'notif-drafts-v1';

export function listDrafts(): NotificationDraft[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch {
    return [];
  }
}

export function saveDraft(input: Omit<NotificationDraft, 'updatedAt' | 'id'> & { id?: string }): NotificationDraft {
  const drafts = listDrafts();
  const id = input.id || `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item: NotificationDraft = {
    id,
    title: input.title,
    body: input.body,
    type: input.type,
    category: input.category,
    coverUrl: input.coverUrl,
    updatedAt: new Date().toISOString(),
  };
  const idx = drafts.findIndex(d => d.id === id);
  if (idx >= 0) drafts[idx] = item;
  else drafts.unshift(item);
  try { localStorage.setItem(KEY, JSON.stringify(drafts)); } catch { /* ignore */ }
  return item;
}

export function removeDraft(id: string): void {
  const drafts = listDrafts().filter(d => d.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(drafts)); } catch { /* ignore */ }
}
