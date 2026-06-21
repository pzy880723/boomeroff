// kb-ingest：消费 kb_ingest_queue → 拉源记录 → chunk → 嵌入 → upsert kb_documents
// 触发方式：pg_cron 每分钟一次，或手动 ?backfill=1 全量回填
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { embedText, EMBED_INFO } from '../_shared/kb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH = 30;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

function chunk(text: string, size = 800, overlap = 100): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    out.push(t.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}

/** 把单条源记录拼成 {title, content, shop_id, metadata, scopes} */
async function buildDoc(admin: any, source_type: string, source_id: string): Promise<
  | { title: string; content: string; shop_id: string | null; metadata: any; scopes: string[] }[]
  | null
> {
  const all = ['image', 'copy', 'video', 'chat'];

  if (source_type === 'official') {
    const { data } = await admin.from('official_knowledge').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    const sp = Array.isArray(data.selling_points) ? data.selling_points.map((x: any) => `· ${typeof x === 'string' ? x : x?.text || ''}`).join('\n') : '';
    const content = [data.description || '', sp, data.tips ? `保养：${data.tips}` : ''].filter(Boolean).join('\n');
    return [{ title: `${data.name || '官方知识'}${data.brand_ip ? `（${data.brand_ip}）` : ''}`, content, shop_id: null, metadata: { category: data.category, brand_ip: data.brand_ip }, scopes: all }];
  }

  if (source_type === 'product_kb') {
    const { data } = await admin.from('product_knowledge').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    return [{ title: data.title || '个人词条', content: data.body || JSON.stringify(data.card || {}), shop_id: null, metadata: { tags: data.tags }, scopes: all }];
  }

  if (source_type === 'product') {
    const { data } = await admin.from('products').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    const sp = Array.isArray(data.selling_points) ? data.selling_points.map((x: any) => `· ${typeof x === 'string' ? x : x?.text || ''}`).join('\n') : '';
    const content = [data.description || '', sp, data.tips ? `小贴士：${data.tips}` : ''].filter(Boolean).join('\n');
    if (!content.trim()) return null;
    return [{ title: data.name || '识别商品', content, shop_id: null, metadata: { category: data.category, brand_ip: data.brand_ip }, scopes: all }];
  }

  if (source_type === 'shop') {
    const { data } = await admin.from('shops').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    const content = [data.address || '', data.description || '', data.business_hours || ''].filter(Boolean).join('\n');
    if (!content.trim()) return null;
    return [{ title: `门店：${data.name}`, content, shop_id: data.id, metadata: {}, scopes: all }];
  }

  if (source_type === 'shop_profile') {
    const { data } = await admin.from('shop_marketing_profiles').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    const fields = ['positioning', 'audience', 'selling_points', 'tone', 'do_list', 'dont_list', 'extra']
      .map((k) => {
        const v = (data as any)[k];
        if (!v) return '';
        return `【${k}】\n${typeof v === 'string' ? v : JSON.stringify(v)}`;
      })
      .filter(Boolean).join('\n\n');
    if (!fields) return null;
    return [{ title: `门店营销画像`, content: fields, shop_id: data.shop_id, metadata: {}, scopes: all }];
  }

  if (source_type === 'shop_kb') {
    const { data } = await admin.from('shop_kb_entries').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    return [{ title: data.title || '门店知识', content: data.body || '', shop_id: data.shop_id, metadata: { tags: data.tags }, scopes: all }];
  }

  if (source_type === 'preset') {
    const { data } = await admin.from('marketing_presets').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    return [{ title: `营销预设：${data.key || data.id}`, content: typeof data.value === 'string' ? data.value : JSON.stringify(data.value), shop_id: null, metadata: {}, scopes: all }];
  }

  if (source_type === 'asset') {
    const { data } = await admin.from('marketing_assets').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    const content = [data.caption || '', Array.isArray(data.tags) ? data.tags.join('、') : ''].filter(Boolean).join('\n');
    if (!content.trim()) return null;
    return [{ title: data.name || '营销素材', content, shop_id: data.shop_id, metadata: { url: data.url, kind: data.kind }, scopes: ['image', 'video', 'copy'] }];
  }

  if (source_type === 'character') {
    const { data } = await admin.from('marketing_characters').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    const content = [data.persona || '', data.style || '', data.notes || ''].filter(Boolean).join('\n');
    if (!content.trim()) return null;
    return [{ title: `人物：${data.name}`, content, shop_id: data.shop_id, metadata: {}, scopes: all }];
  }

  if (source_type === 'community') {
    const { data } = await admin.from('community_posts').select('*').eq('id', source_id).maybeSingle();
    if (!data || !data.is_featured) return null;
    const content = [data.body || data.description || '', Array.isArray(data.tags) ? data.tags.join('、') : ''].filter(Boolean).join('\n');
    if (!content.trim()) return null;
    return [{ title: data.name || '中古圈精选', content, shop_id: null, metadata: {}, scopes: all }];
  }

  if (source_type === 'okr') {
    const { data } = await admin.from('operation_okrs').select('*').eq('id', source_id).maybeSingle();
    if (!data) return null;
    const krs = Array.isArray(data.key_results) ? data.key_results.map((x: any, i: number) => `KR${i + 1}: ${typeof x === 'string' ? x : x?.text || JSON.stringify(x)}`).join('\n') : '';
    const content = [`周期：${data.period_start} ~ ${data.period_end}`, `目标：${data.objective}`, krs, data.key_actions ? `关键动作：${data.key_actions}` : ''].filter(Boolean).join('\n');
    return [{ title: `运营OKR：${data.title}`, content, shop_id: data.shop_id, metadata: { tags: data.tags, scope: data.scope }, scopes: all }];
  }

  if (source_type === 'accepted_output') {
    // 由 kb-accept 直接写入 kb_documents（无 embedding），这里仅补嵌入
    const { data } = await admin.from('kb_documents').select('*').eq('source_type', 'accepted_output').eq('source_id', source_id);
    if (!data || data.length === 0) return null;
    return (data as any[]).map((d) => ({ title: d.title, content: d.content, shop_id: d.shop_id, metadata: d.metadata || {}, scopes: d.scopes || all }));
  }

  return null;
}

async function deleteDocs(admin: any, source_type: string, source_id: string) {
  await admin.from('kb_documents').delete().eq('source_type', source_type).eq('source_id', source_id);
}

async function processOne(admin: any, item: any): Promise<void> {
  const { source_type, source_id, op } = item;
  if (op === 'delete') {
    await deleteDocs(admin, source_type, source_id);
    return;
  }
  const docs = await buildDoc(admin, source_type, source_id);
  if (!docs || docs.length === 0) {
    await deleteDocs(admin, source_type, source_id);
    return;
  }

  // 删除旧文档（按 source 替换）
  await deleteDocs(admin, source_type, source_id);

  for (const d of docs) {
    const chunks = chunk(d.content);
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const text = `${d.title}\n${chunkText}`;
      const ch = hash(text);
      const emb = await embedText(text);
      if (!emb) {
        // 即便嵌入失败也写元数据
        await admin.from('kb_documents').insert({
          source_type, source_id, shop_id: d.shop_id, scopes: d.scopes,
          title: d.title, content: chunkText, content_hash: ch,
          metadata: { ...d.metadata, chunk_index: i },
        });
        continue;
      }
      await admin.from('kb_documents').insert({
        source_type, source_id, shop_id: d.shop_id, scopes: d.scopes,
        title: d.title, content: chunkText, content_hash: ch,
        metadata: { ...d.metadata, chunk_index: i },
        embedding: emb as any,
        embed_model: EMBED_INFO.model,
      });
    }
  }
}

async function enqueueBackfill(admin: any) {
  const sources: Array<{ type: string; table: string; extra?: string }> = [
    { type: 'official', table: 'official_knowledge' },
    { type: 'product_kb', table: 'product_knowledge' },
    { type: 'shop', table: 'shops' },
    { type: 'shop_profile', table: 'shop_marketing_profiles' },
    { type: 'shop_kb', table: 'shop_kb_entries' },
    { type: 'preset', table: 'marketing_presets' },
    { type: 'asset', table: 'marketing_assets' },
    { type: 'character', table: 'marketing_characters' },
    { type: 'okr', table: 'operation_okrs' },
    { type: 'community', table: 'community_posts', extra: 'is_featured.eq.true' },
    { type: 'product', table: 'products' },
  ];
  let total = 0;
  for (const s of sources) {
    let q = admin.from(s.table).select('id');
    if (s.extra) q = q.eq('is_featured', true);
    const { data } = await q;
    for (const row of (data || []) as any[]) {
      await admin.from('kb_ingest_queue').insert({ source_type: s.type, source_id: String(row.id), op: 'upsert' });
      total++;
    }
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  const url = new URL(req.url);

  if (url.searchParams.get('backfill') === '1') {
    const n = await enqueueBackfill(admin);
    return new Response(JSON.stringify({ enqueued: n }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: pending } = await admin
    .from('kb_ingest_queue')
    .select('*')
    .is('processed_at', null)
    .order('enqueued_at', { ascending: true })
    .limit(BATCH);

  let ok = 0, fail = 0;
  for (const item of (pending || []) as any[]) {
    try {
      await processOne(admin, item);
      await admin.from('kb_ingest_queue').update({ processed_at: new Date().toISOString() }).eq('id', item.id);
      ok++;
    } catch (e) {
      console.error('[kb-ingest] failed', item.source_type, item.source_id, e);
      await admin.from('kb_ingest_queue').update({
        attempts: (item.attempts || 0) + 1,
        error: String((e as any)?.message || e),
      }).eq('id', item.id);
      fail++;
    }
  }

  return new Response(JSON.stringify({ processed: ok, failed: fail, remaining: (pending || []).length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
