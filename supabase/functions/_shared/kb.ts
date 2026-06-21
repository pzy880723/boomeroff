// 共享：知识库检索 / 嵌入 工具
// 调用方：edge functions（spirit-chat / generate-marketing-copy / marketing 视频 / shop-kb / ai 生图）

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/embeddings';
const EMBED_MODEL = 'google/gemini-embedding-001';
const EMBED_DIMS = 1536;

export async function embedText(text: string): Promise<number[] | null> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) {
    console.warn('[kb] LOVABLE_API_KEY missing');
    return null;
  }
  const input = (text || '').slice(0, 6000);
  if (!input.trim()) return null;
  try {
    const r = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: EMBED_MODEL, input, dimensions: EMBED_DIMS }),
    });
    if (!r.ok) {
      console.warn('[kb] embed failed', r.status, await r.text().catch(() => ''));
      return null;
    }
    const j = await r.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn('[kb] embed error', e);
    return null;
  }
}

export const EMBED_INFO = { model: EMBED_MODEL, dims: EMBED_DIMS };

export type KbHit = {
  id: string;
  source_type: string;
  source_id: string | null;
  shop_id: string | null;
  title: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
};

/** 检索品牌知识库；失败返回空数组（不阻断主流程）。 */
export async function kbSearch(
  admin: any,
  opts: { query: string; scope: 'image' | 'copy' | 'video' | 'chat'; shopId?: string | null; k?: number; minSim?: number },
): Promise<KbHit[]> {
  try {
    const vec = await embedText(opts.query);
    if (!vec) return [];
    const { data, error } = await admin.rpc('match_kb', {
      query_embedding: vec,
      match_count: opts.k ?? 6,
      scope_filter: opts.scope,
      shop_filter: opts.shopId ?? null,
      min_similarity: opts.minSim ?? 0.55,
    });
    if (error) {
      console.warn('[kb] match_kb error', error);
      return [];
    }
    const hits = ((data || []) as KbHit[])
      .filter((h) => (h.similarity ?? 0) >= (opts.minSim ?? 0.55))
      .slice(0, opts.k ?? 6);
    return hits;
  } catch (e) {
    console.warn('[kb] search error', e);
    return [];
  }
}

/** 把命中拼成可注入 system prompt 的中文知识块。空则返回空串。 */
export function formatKbBlock(hits: KbHit[], header = '【BOOMER 品牌知识参考】'): string {
  if (!hits || hits.length === 0) return '';
  const body = hits
    .map((h, i) => `--- 参考${i + 1}（${h.source_type}｜相似度 ${(h.similarity * 100).toFixed(0)}%）\n${h.title}\n${(h.content || '').slice(0, 600)}`)
    .join('\n\n');
  return `\n\n${header}\n${body}\n\n请优先参考上述品牌知识；若与用户输入冲突，以用户最新输入为准。`;
}

/** 把命中精简为前端徽章用的元数据。 */
export function kbSourcesMeta(hits: KbHit[]) {
  return hits.map((h) => ({
    id: h.id,
    source_type: h.source_type,
    title: h.title,
    similarity: Math.round((h.similarity ?? 0) * 100) / 100,
  }));
}
