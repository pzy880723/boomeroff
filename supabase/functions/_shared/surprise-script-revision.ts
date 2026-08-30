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
      summary: String(row.description || row.summary || row.category || '当前门店真实实景'),
      category: row.category ? String(row.category) : null,
      role: 'scene',
    });
    if (ordered.length >= 9) break;
  }
  return ordered;
}
