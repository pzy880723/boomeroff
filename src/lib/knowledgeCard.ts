// 共享「知识卡」结构：官方知识 / 个人识别历史 / 个人手建词条 / 识别结果 都使用同一份字段。
// 不含 body（深度阅读长正文，仅官方知识使用）。

export interface KnowledgeCardPoint {
  tag?: string;
  text: string;
  detail?: string;
}

export interface KnowledgeCard {
  one_liner?: string;
  pronunciation?: string;
  aliases?: string[];
  summary?: string;
  quick_facts?: Array<{ label: string; value: string }>;
  customer_pitches?: Array<{ scene: string; line: string }>;
  selling_points_rich?: KnowledgeCardPoint[];
  comparisons?: Array<{ name: string; diff: string }>;
}

// 从任意来源（official_knowledge.content / products.ai_analysis.card /
// product_knowledge.content / enrich-recognition 返回值）抽取并标准化知识卡字段。
export function pickKnowledgeCard(raw: unknown): KnowledgeCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const card: KnowledgeCard = {};

  if (typeof r.one_liner === 'string' && r.one_liner.trim()) card.one_liner = r.one_liner.trim();
  if (typeof r.pronunciation === 'string' && r.pronunciation.trim()) card.pronunciation = r.pronunciation.trim();
  if (typeof r.summary === 'string' && r.summary.trim()) card.summary = r.summary.trim();

  if (Array.isArray(r.aliases)) {
    const arr = r.aliases.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim());
    if (arr.length) card.aliases = arr;
  }

  if (Array.isArray(r.quick_facts)) {
    const arr = (r.quick_facts as unknown[])
      .map((f) => (f && typeof f === 'object' ? f as Record<string, unknown> : null))
      .filter((f): f is Record<string, unknown> => !!f && typeof f.label === 'string' && typeof f.value === 'string')
      .map((f) => ({ label: String(f.label), value: String(f.value) }));
    if (arr.length) card.quick_facts = arr;
  }

  if (Array.isArray(r.customer_pitches)) {
    const arr = (r.customer_pitches as unknown[])
      .map((p) => (p && typeof p === 'object' ? p as Record<string, unknown> : null))
      .filter((p): p is Record<string, unknown> => !!p && typeof p.scene === 'string' && typeof p.line === 'string')
      .map((p) => ({ scene: String(p.scene), line: String(p.line) }));
    if (arr.length) card.customer_pitches = arr;
  }

  // selling_points_rich 优先；fallback 到 selling_points（带 detail 才算 rich）
  const spSource = (Array.isArray(r.selling_points_rich) ? r.selling_points_rich : r.selling_points) as unknown;
  if (Array.isArray(spSource)) {
    const arr: KnowledgeCardPoint[] = [];
    for (const p of spSource as unknown[]) {
      if (!p) continue;
      if (typeof p === 'string' && p.trim()) {
        arr.push({ text: p.trim() });
        continue;
      }
      if (typeof p === 'object') {
        const o = p as Record<string, unknown>;
        if (typeof o.text === 'string' && o.text.trim()) {
          arr.push({
            text: String(o.text).trim(),
            tag: typeof o.tag === 'string' ? o.tag : undefined,
            detail: typeof o.detail === 'string' && o.detail.trim() ? String(o.detail).trim() : undefined,
          });
        }
      }
    }
    if (arr.length) card.selling_points_rich = arr;
  }

  if (Array.isArray(r.comparisons)) {
    const arr = (r.comparisons as unknown[])
      .map((c) => (c && typeof c === 'object' ? c as Record<string, unknown> : null))
      .filter((c): c is Record<string, unknown> => !!c && typeof c.name === 'string' && typeof c.diff === 'string')
      .map((c) => ({ name: String(c.name), diff: String(c.diff) }));
    if (arr.length) card.comparisons = arr;
  }

  const empty =
    !card.one_liner && !card.pronunciation && !card.summary &&
    !card.aliases?.length && !card.quick_facts?.length &&
    !card.customer_pitches?.length && !card.selling_points_rich?.length &&
    !card.comparisons?.length;
  return empty ? null : card;
}

// 把官方词条整合成知识卡（content + selling_points 等）
export function officialRowToCard(row: {
  content?: unknown;
  selling_points?: unknown;
  summary?: string | null;
}): KnowledgeCard | null {
  const merged: Record<string, unknown> = {
    ...(row.content && typeof row.content === 'object' ? row.content as Record<string, unknown> : {}),
  };
  if (row.summary && !merged.summary) merged.summary = row.summary;
  if (Array.isArray(row.selling_points) && !merged.selling_points_rich && !merged.selling_points) {
    merged.selling_points = row.selling_points;
  } else if (Array.isArray(row.selling_points) && !merged.selling_points_rich) {
    merged.selling_points_rich = row.selling_points;
  }
  return pickKnowledgeCard(merged);
}
