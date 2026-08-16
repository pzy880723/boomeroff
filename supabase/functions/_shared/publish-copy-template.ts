export interface ShopPublishDetails {
  name?: string | null;
  address?: string | null;
  business_hours?: string | null;
}

export interface DynamicPublishCopy {
  title?: string | null;
  body?: string | null;
  hashtags?: unknown;
  topics?: unknown;
  first_comment?: string | null;
  [key: string]: unknown;
}

export interface LockedShopDetails {
  name?: string;
  address?: string;
  business_hours?: string;
  block: string;
  locked: boolean;
}

export interface ComposedPublishCopy {
  title: string;
  body: string;
  hashtags: string[];
  first_comment: string;
  shop_details: LockedShopDetails;
}

const DETAIL_LINE = /^(?:📍|🏢|🕙)|(?:门店地址|地址|坐标|营业时间|营业到|营业至|开门时间|打烊时间)\s*[:：]?/i;
const DETAIL_TEXT = /(?:门店地址|地址|坐标|营业时间|营业到|营业至|开门时间|打烊时间)|\d{1,2}:\d{2}/i;

function clean(value: unknown): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function normalizeBusinessHours(value: unknown): string {
  return clean(value).replace(/^营业时间\s*[:：]?\s*/i, '').trim();
}

export function formatLockedShopBlock(shop: ShopPublishDetails | null | undefined): string {
  if (!shop) return '';
  const name = clean(shop.name);
  const address = clean(shop.address);
  const businessHours = normalizeBusinessHours(shop.business_hours);
  return [
    name ? `📍 ${name}` : '',
    address ? `🏢 ${address}` : '',
    businessHours ? `🕙 营业时间：${businessHours}` : '',
  ].filter(Boolean).join('\n');
}

function stripGeneratedShopDetails(value: unknown): string {
  return clean(value)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !DETAIL_LINE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeHashtags(copy: DynamicPublishCopy): string[] {
  const raw = Array.isArray(copy.hashtags)
    ? copy.hashtags
    : Array.isArray(copy.topics)
      ? copy.topics
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    const text = clean(item).replace(/^#+/, '');
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key) || key === 'boomeroff') continue;
    seen.add(key);
    tags.push(`#${text}`);
  }
  return ['#BOOMEROFF', ...tags].slice(0, 12);
}

export function composeLockedPublishCopy(
  copy: DynamicPublishCopy,
  shop: ShopPublishDetails | null | undefined,
): ComposedPublishCopy {
  const block = formatLockedShopBlock(shop);
  const dynamicBody = stripGeneratedShopDetails(copy.body);
  const body = [dynamicBody, block].filter(Boolean).join('\n\n');
  const firstComment = clean(copy.first_comment);
  const safeFirstComment = DETAIL_TEXT.test(firstComment)
    ? '你最想在店里淘到什么？👀'
    : firstComment;
  const normalizedShop = shop
    ? {
        ...(clean(shop.name) ? { name: clean(shop.name) } : {}),
        ...(clean(shop.address) ? { address: clean(shop.address) } : {}),
        ...(normalizeBusinessHours(shop.business_hours)
          ? { business_hours: normalizeBusinessHours(shop.business_hours) }
          : {}),
        block,
        locked: Boolean(block),
      }
    : { block: '', locked: false };

  return {
    title: clean(copy.title).slice(0, 40),
    body: body.slice(0, 1200),
    hashtags: normalizeHashtags(copy),
    first_comment: safeFirstComment.slice(0, 200),
    shop_details: normalizedShop,
  };
}
