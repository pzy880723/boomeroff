export interface SurpriseConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SurpriseScriptVersion {
  at: string;
  source: 'generated' | 'manual' | 'conversation' | 'references';
  instruction?: string;
  script: unknown;
}

export interface SurpriseReferenceAsset {
  asset_id: string;
  index: number;
  url: string;
  summary: string;
  category: string | null;
  role: 'storefront' | 'scene';
}

export interface SurprisePersonaRevision {
  label: string;
  gender: 'male' | 'female' | 'any';
  age: number;
  visual: string;
  vibe: string;
  pace: 'medium' | 'fast';
  tone_label: string;
  opener: string;
  catchphrase: string[];
  cta: string;
  group_type: 'solo' | 'couple' | 'family';
  age_bucket: 'young' | 'middle' | 'senior';
  companions: Array<{ role: string; visual: string }>;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function textOf(value: unknown, fallback: string, max: number): string {
  return String(value || '').trim().slice(0, max) || fallback;
}

export function normalizeSurprisePersonaRevision(
  current: unknown,
  candidate: unknown,
): SurprisePersonaRevision {
  const base = objectOf(current);
  const next = objectOf(candidate);
  const rawAge = Number(next.age ?? base.age ?? 28);
  const age = Math.max(18, Math.min(75, Number.isFinite(rawAge) ? Math.round(rawAge) : 28));
  const genderValue = next.gender ?? base.gender;
  const gender = genderValue === 'male' || genderValue === 'female' ? genderValue : 'any';
  const groupValue = next.group_type ?? base.group_type;
  const groupType = groupValue === 'couple' || groupValue === 'family' ? groupValue : 'solo';
  const rawCatchphrase = Array.isArray(next.catchphrase) ? next.catchphrase : base.catchphrase;
  const catchphrase = (Array.isArray(rawCatchphrase) ? rawCatchphrase : [])
    .map((item) => String(item || '').trim().slice(0, 12))
    .filter(Boolean)
    .slice(0, 3);
  const rawCompanions = Array.isArray(next.companions) ? next.companions : base.companions;
  const companions = groupType === 'solo' ? [] : (Array.isArray(rawCompanions) ? rawCompanions : [])
    .map((item) => objectOf(item))
    .map((item) => ({
      role: textOf(item.role, '', 20),
      visual: textOf(item.visual, '', 100),
    }))
    .filter((item) => item.role && item.visual)
    .slice(0, 2);

  return {
    label: textOf(next.label, textOf(base.label, '原创探店博主', 40), 40),
    gender,
    age,
    visual: textOf(next.visual, textOf(base.visual, '自然真实的普通人穿搭', 200), 200),
    vibe: textOf(next.vibe, textOf(base.vibe, '活泼真诚', 80), 80),
    pace: (next.pace ?? base.pace) === 'fast' ? 'fast' : 'medium',
    tone_label: textOf(next.tone_label, textOf(base.tone_label, '真诚种草', 12), 12),
    opener: textOf(next.opener, textOf(base.opener, '快看', 10), 10),
    catchphrase: catchphrase.length ? catchphrase : ['真的好逛'],
    cta: textOf(next.cta, textOf(base.cta, '现在就来', 12), 12),
    group_type: groupType,
    age_bucket: age >= 55 ? 'senior' : age >= 34 ? 'middle' : 'young',
    companions,
  };
}

export function appendSurpriseConversation(
  current: unknown,
  userContent: string,
  assistantContent: string,
): SurpriseConversationMessage[] {
  const previous = Array.isArray(current)
    ? current.filter((item): item is SurpriseConversationMessage => (
      item?.role === 'user' || item?.role === 'assistant'
    ) && typeof item?.content === 'string')
    : [];
  return [
    ...previous,
    { role: 'user' as const, content: userContent.trim().slice(0, 500) },
    { role: 'assistant' as const, content: assistantContent.trim().slice(0, 500) },
  ].slice(-12);
}

export function appendSurpriseScriptVersion(
  current: unknown,
  script: unknown,
  source: SurpriseScriptVersion['source'],
  instruction?: string,
): SurpriseScriptVersion[] {
  const previous = Array.isArray(current) ? current : [];
  return [
    ...previous,
    {
      at: new Date().toISOString(),
      source,
      ...(instruction?.trim() ? { instruction: instruction.trim().slice(0, 500) } : {}),
      script,
    },
  ].slice(-8) as SurpriseScriptVersion[];
}

export function orderSurpriseReferenceAssets(
  storefront: Partial<SurpriseReferenceAsset> | null | undefined,
  selectedRows: Array<Record<string, unknown>>,
): SurpriseReferenceAsset[] {
  if (!storefront?.asset_id || !storefront.url) {
    throw new Error('当前任务没有可确认的真实门头图，请重新生成脚本');
  }

  const ordered: SurpriseReferenceAsset[] = [{
    asset_id: String(storefront.asset_id),
    index: 0,
    url: String(storefront.url),
    summary: String(storefront.summary || '当前门店真实入口与 BOOMER·OFF 门头'),
    category: storefront.category ? String(storefront.category) : null,
    role: 'storefront',
  }];
  const seen = new Set([ordered[0].url]);
  for (const row of selectedRows) {
    const url = String(row.output_url || row.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    ordered.push({
      asset_id: String(row.id || row.asset_id || ''),
      index: ordered.length,
      url,
      summary: String(row.output_text || row.summary || row.category || '当前门店真实实景'),
      category: row.category ? String(row.category) : null,
      role: 'scene',
    });
    if (ordered.length >= 9) break;
  }
  return ordered;
}
