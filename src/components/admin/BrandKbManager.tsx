// 品牌专属知识库 · 管理面板
// 查看所有 kb_documents、调权、调整 scope、手动新增 manual 词条、查看队列、触发回填
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Plus, Trash2, Database } from 'lucide-react';

type KbDoc = {
  id: string;
  source_type: string;
  source_id: string | null;
  shop_id: string | null;
  scopes: string[];
  title: string;
  content: string;
  weight: number;
  embed_model: string | null;
  updated_at: string;
};

const SCOPES_ALL = ['image', 'copy', 'video', 'chat'] as const;

export function BrandKbManager() {
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [search, setSearch] = useState('');
  const [queueCount, setQueueCount] = useState(0);
  const [busy, setBusy] = useState(false);

  // 新增 manual
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>([...SCOPES_ALL]);

  async function loadDocs() {
    setLoading(true);
    let q = supabase.from('kb_documents' as any).select('*').order('updated_at', { ascending: false }).limit(200);
    if (filterType) q = q.eq('source_type', filterType);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setDocs((data as any) || []);
    setLoading(false);
  }

  async function loadQueue() {
    const { count } = await supabase.from('kb_ingest_queue' as any).select('*', { count: 'exact', head: true }).is('processed_at', null);
    setQueueCount(count || 0);
  }

  useEffect(() => { loadDocs(); loadQueue(); }, [filterType]);

  async function addManual() {
    if (!newTitle.trim() || !newContent.trim()) return toast.error('请填写标题和正文');
    setBusy(true);
    const { error } = await supabase.from('kb_documents' as any).insert({
      source_type: 'manual',
      source_id: crypto.randomUUID(),
      title: newTitle.trim(),
      content: newContent.trim(),
      scopes: newScopes,
      metadata: {},
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('已添加，后台会自动嵌入向量');
    setNewTitle(''); setNewContent('');
    // 立刻触发一次 ingest 以补嵌入
    supabase.functions.invoke('kb-ingest').catch(() => {});
    loadDocs();
  }

  async function updateDoc(id: string, patch: Partial<KbDoc>) {
    const { error } = await supabase.from('kb_documents' as any).update(patch).eq('id', id);
    if (error) toast.error(error.message);
    loadDocs();
  }

  async function delDoc(id: string) {
    if (!confirm('确定删除这条知识？')) return;
    const { error } = await supabase.from('kb_documents' as any).delete().eq('id', id);
    if (error) return toast.error(error.message);
    loadDocs();
  }

  async function backfillAll() {
    if (!confirm('把所有源表重新入队、全量重建？')) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('kb-ingest', { body: {}, method: 'POST' as any });
    // 也调一下 backfill
    try {
      const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/kb-ingest?backfill=1`;
      const r = await fetch(url, { method: 'POST', headers: { apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      const j = await r.json();
      toast.success(`已入队 ${j?.enqueued ?? 0} 条`);
    } catch (e: any) { toast.error(e?.message || '入队失败'); }
    setBusy(false);
    loadQueue();
  }

  async function processNow() {
    setBusy(true);
    try {
      const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/kb-ingest`;
      const r = await fetch(url, { method: 'POST', headers: { apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      const j = await r.json();
      toast.success(`本批：处理 ${j.processed} 条 / 失败 ${j.failed} 条`);
    } catch (e: any) { toast.error(e?.message); }
    setBusy(false);
    loadDocs(); loadQueue();
  }

  const sourceTypes = ['', 'official', 'product_kb', 'product', 'shop', 'shop_profile', 'shop_kb', 'preset', 'asset', 'character', 'community', 'okr', 'manual', 'accepted_output'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" /> 品牌专属知识库
          </h2>
          <p className="text-xs text-muted-foreground mt-1">所有 AI（生图 / 文案 / 视频 / BOOMER 浮标）默认检索这里；新数据自动入队</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={queueCount > 0 ? 'default' : 'secondary'}>队列 {queueCount}</Badge>
          <Button size="sm" variant="outline" onClick={processNow} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1">处理队列</span>
          </Button>
          <Button size="sm" variant="outline" onClick={backfillAll} disabled={busy}>全量重建</Button>
        </div>
      </div>

      {/* 新增 manual */}
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">手动加一条品牌知识</div>
        <Input placeholder="标题（必填）" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <Textarea placeholder="正文（必填，会被切块嵌入向量；可写品牌故事、运营心得、目标用户画像、口吻样例……）" rows={4} value={newContent} onChange={(e) => setNewContent(e.target.value)} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">可用于：</span>
          {SCOPES_ALL.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" checked={newScopes.includes(s)}
                onChange={(e) => setNewScopes(e.target.checked ? [...newScopes, s] : newScopes.filter((x) => x !== s))} />
              {s === 'chat' ? 'BOOMER 对话' : s === 'image' ? '生图' : s === 'copy' ? '文案' : '视频'}
            </label>
          ))}
          <Button size="sm" onClick={addManual} disabled={busy} className="ml-auto"><Plus className="h-4 w-4 mr-1" />添加</Button>
        </div>
      </Card>

      {/* 筛选 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select className="text-sm border rounded px-2 py-1 bg-background" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          {sourceTypes.map((t) => <option key={t || 'all'} value={t}>{t || '全部来源'}</option>)}
        </select>
        <Input placeholder="按标题搜" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={loadDocs} className="max-w-xs" />
        <Button size="sm" variant="ghost" onClick={loadDocs}><RefreshCw className="h-4 w-4" /></Button>
        <span className="text-xs text-muted-foreground ml-auto">{loading ? '加载中…' : `${docs.length} 条`}</span>
      </div>

      {/* 列表 */}
      <div className="space-y-2">
        {docs.map((d) => (
          <Card key={d.id} className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs">{d.source_type}</Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{d.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{d.content}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => delDoc(d.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">范围：</span>
                {SCOPES_ALL.map((s) => (
                  <label key={s} className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={d.scopes?.includes(s)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...new Set([...(d.scopes || []), s])] : (d.scopes || []).filter((x) => x !== s);
                        updateDoc(d.id, { scopes: next });
                      }} />
                    {s}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">权重</span>
                <input type="range" min={0.2} max={2} step={0.1} value={d.weight} onChange={(e) => updateDoc(d.id, { weight: Number(e.target.value) })} />
                <span>{d.weight.toFixed(1)}</span>
              </div>
              <span className="text-muted-foreground ml-auto">{d.embed_model ? '✓ 已嵌入' : '⏳ 待嵌入'}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
