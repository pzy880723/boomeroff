import { resolveVideoAssetCopy } from './videoAssetCopy.ts';

export const PUBLISH_PLATFORMS = [
  'xhs',
  'douyin',
  'kuaishou',
  'wechat_video',
  'dianping',
] as const;

const PUBLISH_PLATFORM_SET = new Set<string>(PUBLISH_PLATFORMS);

interface PublishAccountLike {
  id: string;
  platform: string;
  cookie_status?: string | null;
  online?: boolean | null;
  worker_account_id?: number | null;
  worker_account_key?: string | null;
}

interface PublishAssetLike {
  output_text?: string | null;
  tags?: unknown;
  meta?: unknown;
}

export function isPublishableAccount(account: PublishAccountLike): boolean {
  if (!PUBLISH_PLATFORM_SET.has(account.platform)) return false;
  if (account.cookie_status === 'expired') return false;
  if (account.online !== true) return false;
  return account.worker_account_id != null || Boolean(account.worker_account_key);
}

export function buildDefaultAccountSelection(
  accounts: PublishAccountLike[],
  supports: (platform: string) => boolean,
): Record<string, boolean> {
  return accounts.reduce<Record<string, boolean>>((selection, account) => {
    if (isPublishableAccount(account) && supports(account.platform)) {
      selection[account.id] = true;
    }
    return selection;
  }, {});
}

export function resolvePublishDraft(asset: PublishAssetLike): {
  title: string;
  body: string;
  tagsRaw: string;
} {
  const meta = (asset.meta && typeof asset.meta === 'object' ? asset.meta : {}) as Record<string, unknown>;
  const fixedCopy = resolveVideoAssetCopy(meta);
  const tags = fixedCopy?.hashtags?.length
    ? fixedCopy.hashtags
    : Array.isArray(asset.tags)
      ? asset.tags.map(String)
      : [];

  return {
    title: String(fixedCopy?.title || meta.note_title || meta.title || '').slice(0, 100),
    body: String(fixedCopy?.body || meta.note_body || asset.output_text || ''),
    tagsRaw: tags.map((tag) => tag.replace(/^#/, '')).filter(Boolean).join(' '),
  };
}
