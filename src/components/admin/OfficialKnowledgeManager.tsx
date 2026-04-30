import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, Edit, Loader2, Search, ImageOff, Sparkles } from 'lucide-react';
import { CATEGORY_LABELS, CATEGORY_ORDER, ProductCategory } from '@/types';
import { toast } from 'sonner';

interface Item {
  id: string;
  category: ProductCategory;
  ip_name: string | null;
  name: string;
  summary: string | null;
  era: string | null;
  origin: string | null;
  cover_url: string | null;
  selling_points: string[];
  tips: string | null;
  importance_score: number;
  view_count: number;
  favorite_count: number;
  created_at: string;
}

const empty = (): Partial<Item> => ({
  category: 'other', ip_name: '', name: '', summary: '', era: '', origin: '',
  cover_url: '', selling_points: [], tips: '', importance_score: 0,
});

export function OfficialKnowledgeManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [cat, setCat] = useState<ProductCategory | 'all'>('all');
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Item | null>(null);
  const [pointsText, setPointsText] = useState('');
  const [computing, setComputing] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('official_knowledge').select('*').order('created_at', { ascending: false });
    if (cat !== 'all') q = q.eq('category', cat);
    if (keyword.trim()) q = q.or(`name.ilike.%${keyword}%,ip_name.ilike.%${keyword}%`);
    const { data } = await q.limit(200);
    setItems((data || []) as unknown as Item[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [cat, keyword]);

  const openEdit = (it?: Item) => {
    const v = it || empty();
    setEditing(v);
    setPointsText(Array.isArray(v.selling_points) ? v.selling_points.join('\n') : '');
    setOpen(true);
  };

  const save = async () => {
    if (!editing || !editing.name?.trim()) { toast.error('名称必填'); return; }
    const payload = {
      category: editing.category || 'other',
      ip_name: editing.ip_name?.trim() || null,
      name: editing.name.trim(),
      summary: editing.summary?.trim() || null,
      era: editing.era?.trim() || null,
      origin: editing.origin?.trim() || null,
      cover_url: editing.cover_url?.trim() || null,
      selling_points: pointsText.split('\n').map((s) => s.trim()).filter(Boolean),
      tips: editing.tips?.trim() || null,
      importance_score: Math.min(100, Math.max(0, Number(editing.importance_score) || 0)),
    };
    const { error } = editing.id
      ? await supabase.from('official_knowledge').update(payload).eq('id', editing.id)
      : await supabase.from('official_knowledge').insert(payload);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('已保存');
    setOpen(false); setEditing(null);
    void load();
  };

  const computeImportance = async () => {
    setComputing(true);
    try {
      let totalProcessed = 0;
      let rounds = 0;
      // 最多 10 轮（约 300 条），防止意外死循环
      while (rounds < 10) {
        const { data, error } = await supabase.functions.invoke('compute-importance', {
          body: { limit: 30, onlyMissing: true },
        });
        if (error) { toast.error('计算失败：' + error.message); break; }
        const processed = Number(data?.processed ?? 0);
        const remaining = Number(data?.remaining ?? 0);
        totalProcessed += processed;
        toast.message(`已处理 ${totalProcessed} 条，剩余 ${remaining} 条…`);
        if (processed === 0 || remaining === 0) break;
        rounds += 1;
      }
      toast.success(`重要程度已更新（共 ${totalProcessed} 条）`);
      void load();
    } finally {
      setComputing(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    const { error } = await supabase.from('official_knowledge').delete().eq('id', del.id);
    if (error) toast.error('删除失败');
    else { toast.success('已删除'); void load(); }
    setDel(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cat} onValueChange={(v) => setCat(v as ProductCategory | 'all')}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部品类</SelectItem>
            {CATEGORY_ORDER.map((k) => (
              <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索名称 / IP" className="pl-8 h-9" />
        </div>
        <Button size="sm" onClick={() => openEdit()} className="ml-auto">
          <Plus className="w-4 h-4 mr-1.5" /> 新增
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">封面</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="hidden sm:table-cell">品类 / IP</TableHead>
              <TableHead className="hidden md:table-cell">年代 · 产地</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />加载中...
              </TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                暂无官方词条，点击「新增」或在「知识库」标签页一键提升
              </TableCell></TableRow>
            ) : items.map((it) => (
              <TableRow key={it.id}>
                <TableCell>
                  {it.cover_url ? (
                    <img src={it.cover_url} alt={it.name} className="w-10 h-10 rounded-md object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                      <ImageOff className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium truncate max-w-[200px]">{it.name}</div>
                  {it.summary && <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">{it.summary}</div>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="secondary">{CATEGORY_LABELS[it.category]}</Badge>
                    {it.ip_name && <Badge variant="outline">{it.ip_name}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                  {[it.era, it.origin].filter(Boolean).join(' · ') || '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(it)}><Edit className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDel(it)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? '编辑官方词条' : '新增官方词条'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>名称 *</Label>
                <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>品类</Label>
                  <Select value={editing.category || 'other'} onValueChange={(v) => setEditing({ ...editing, category: v as ProductCategory })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ORDER.map((k) => (
                        <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>IP / 系列</Label>
                  <Input value={editing.ip_name || ''} onChange={(e) => setEditing({ ...editing, ip_name: e.target.value })} placeholder="如：伊万里、唐草纹" />
                </div>
              </div>
              <div>
                <Label>简介</Label>
                <Textarea rows={2} value={editing.summary || ''} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>年代</Label>
                  <Input value={editing.era || ''} onChange={(e) => setEditing({ ...editing, era: e.target.value })} />
                </div>
                <div>
                  <Label>产地</Label>
                  <Input value={editing.origin || ''} onChange={(e) => setEditing({ ...editing, origin: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>封面图 URL</Label>
                <Input value={editing.cover_url || ''} onChange={(e) => setEditing({ ...editing, cover_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <Label>核心卖点（每行一条）</Label>
                <Textarea rows={4} value={pointsText} onChange={(e) => setPointsText(e.target.value)} />
              </div>
              <div>
                <Label>小贴士</Label>
                <Textarea rows={2} value={editing.tips || ''} onChange={(e) => setEditing({ ...editing, tips: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>即将删除官方词条「{del?.name}」</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
