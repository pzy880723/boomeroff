export type LoginIdentity = { email: string } | { phone: string };

export function normalizeLoginIdentity(account: string): LoginIdentity {
  const normalized = account.trim().toLowerCase();
  if (/^1[3-9]\d{9}$/.test(normalized)) {
    return { phone: normalized };
  }
  if (normalized.includes('@')) {
    return { email: normalized };
  }
  return { email: `${normalized}@boomeroff.local` };
}
