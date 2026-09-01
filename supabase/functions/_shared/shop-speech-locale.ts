export interface ShopSpeechSource {
  name?: string | null;
  address?: string | null;
  description?: string | null;
  profile_description?: string | null;
}

export interface ShopSpeechLocale {
  city: string | null;
  district: string | null;
  dialect: string | null;
}

const DIALECT_REQUEST = /(方言|本地话|当地话|地方话|温州话|上海话|沪语|鹿城话)/;

function sourceText(source: ShopSpeechSource | null | undefined): string {
  if (!source) return '';
  return [source.name, source.address, source.description, source.profile_description]
    .filter(Boolean)
    .join(' ');
}

function matchedDistrict(text: string): string | null {
  const afterCity = text.match(/市([\u4e00-\u9fa5]{2,6}(?:区|县))/);
  if (afterCity?.[1]) return afterCity[1];
  const match = text.match(/([\u4e00-\u9fa5]{2,4}(?:区|县))/);
  return match?.[1] || null;
}

export function resolveShopSpeechLocale(
  source: ShopSpeechSource | null | undefined,
): ShopSpeechLocale {
  const text = sourceText(source);
  const district = matchedDistrict(text);

  if (/温州|朔门|鹿城/.test(text)) {
    const resolvedDistrict = /朔门|鹿城/.test(text) ? '鹿城区' : district;
    return {
      city: '温州',
      district: resolvedDistrict || null,
      dialect: resolvedDistrict === '鹿城区' ? '温州鹿城区方言' : '温州本地方言',
    };
  }

  if (/上海|中信泰富|南京西路/.test(text)) {
    return { city: '上海', district, dialect: '上海话' };
  }

  const cityMatch = text.match(/([\u4e00-\u9fa5]{2,6})市/);
  const city = cityMatch?.[1] || null;
  return {
    city,
    district,
    dialect: city ? `${city}本地方言` : null,
  };
}

export function buildShopSpeechInstruction(
  source: ShopSpeechSource | null | undefined,
  requestText = '',
): string {
  const locale = resolveShopSpeechLocale(source);
  const location = locale.city
    ? `${locale.city}市${locale.district || ''}`
    : '当前门店所在地';
  const localityRule = `当前门店属地:${location}。内容应与当前门店所在城市和区域相符，不得串用其他城市地名、方言或生活场景。`;

  if (!DIALECT_REQUEST.test(requestText)) {
    return `${localityRule} 默认使用自然清晰的普通话，不得自行加入方言。`;
  }

  const dialect = locale.dialect || '当前门店本地方言';
  return `${localityRule} 店员明确要求方言时，必须使用${dialect}，不要混用其他地区口音；对白与字幕逐字一致，并保持当地人自然易懂的口语。`;
}
