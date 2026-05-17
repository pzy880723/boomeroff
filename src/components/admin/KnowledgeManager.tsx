import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, Edit, Search, Loader2, ChevronLeft, ChevronRight, ImageOff, ArrowUpCircle, BadgeCheck,
} from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { thumbUrl } from '@/lib/imageUrl';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { KnowledgeEditDialog, KnowledgeRecord } from './KnowledgeEditDialog';
import { AutoCategorizeButton } from './AutoCategorizeButton';

const PAGE_SIZE = 20;

interface Row extends KnowledgeRecord {
  id: string;
  created_at: string;
  is_official?: boolean;
}

export function KnowledgeManager() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<KnowledgeRecord | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [singleDelete, setSingleDelete] = useState<Row | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [category, debouncedSearch]);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, debouncedSearch, page]);

  useEffect(() => { void loadCounts(); }, []);

  const loadCounts = async () => {
    const { data } = await supabase.from('product_knowledge').select('category');
    if (!data) return;
    const c: Record<string, number> = {};
    data.forEach((r: { category: string }) => { c[r.category] = (c[r.category] || 0) + 1; });
    setCounts(c);
  };

  const loadList = async () => {
    setLoading(true);
    setSelected(new Set());
    let query = supabase
      .from('product_knowledge')
      .select('id, product_name, category, era, origin, selling_points, tips, image_url, created_at, is_official', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (category !== 'all') query = query.eq('category', category);
    if (debouncedSearch) query = query.ilike('product_name', `%${debouncedSearch}%`);

    const { data, count, error } = await query;
    if (error) {
      toast.error('加载失败');
      setRows([]); setTotal(0);
    } else {
      setRows((data || []) as Row[]);
      setTotal(count || 0);
    }
    setLoading(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditRecord({
      product_name: '',
      category: category === 'all' ? 'other' : category,
      era: '',
      origin: '',
      selling_points: [],
      tips: '',
      image_url: '',
    });
    setEditOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditRecord(row);
    setEditOpen(true);
  };

  const handleSingleDelete = async () => {
    if (!singleDelete) return;
    const { error } = await supabase
      .from('product_knowledge')
      .delete()
      .eq('id', singleDelete.id);
    if (error) {
      toast.error('删除失败');
    } else {
      toast.success('已删除');
      void loadList(); void loadCounts();
    }
    setSingleDelete(null);
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase
      .from('product_knowledge')
      .delete()
      .in('id', ids);
    if (error) {
      toast.error('批量删除失败');
    } else {
      toast.success(`已删除 ${ids.length} 条`);
      void loadList(); void loadCounts();
    }
    setBulkOpen(false);
  };

  const promoteToOfficial = async (row: Row) => {
    if (row.is_official) { toast.info('已是官方'); return; }
    const { error: insErr } = await supabase.from('official_knowledge').insert({
      category: row.category,
      name: row.product_name,
      summary: Array.isArray(row.selling_points) && row.selling_points[0] ? row.selling_points[0] : null,
      selling_points: row.selling_points || [],
      tips: row.tips || null,
      era: row.era || null,
      origin: row.origin || null,
      cover_url: row.image_url || null,
      source_product_id: row.id,
    });
    if (insErr) { toast.error('提升失败：' + insErr.message); return; }
    await supabase.from('product_knowledge').update({ is_official: true }).eq('id', row.id);
    toast.success('已提升为官方知识');
    void loadList();
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const partial = selected.size > 0 && !allSelected;

  const categoryOptions = useMemo(() => {
    return (Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((k) => ({
      value: k,
      label: `${CATEGORY_LABELS[k]}${counts[k] ? ` (${counts[k]})` : ''}`,
    }));
  }, [counts]);

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory | 'all')}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部品类 ({total || 0})</SelectItem>
            {categoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称..."
            className="pl-8 h-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && isAdmin && (
            <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              批量删除 ({selected.size})
            </Button>
          )}
          {isAdmin && (
            <AutoCategorizeButton target="personal" onDone={() => { void loadList(); void loadCounts(); }} />
          )}
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              新增
            </Button>
          )}
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected || (partial ? 'indeterminate' : false)}
                  onCheckedChange={toggleAll}
                  disabled={!isAdmin || rows.length === 0}
                />
              </TableHead>
              <TableHead className="w-14">图</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="hidden sm:table-cell">品类</TableHead>
              <TableHead className="hidden md:table-cell">年代 · 产地</TableHead>
              <TableHead className="hidden lg:table-cell">创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  加载中...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  暂无知识点
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-state={selected.has(row.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggleOne(row.id)}
                      disabled={!isAdmin}
                    />
                  </TableCell>
                  <TableCell>
                    {row.image_url ? (
                      <img src={thumbUrl(row.image_url, 96) || row.image_url} alt={row.product_name}
                        className="w-10 h-10 rounded-md object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                        <ImageOff className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium truncate max-w-[180px] flex items-center gap-1">
                      {row.product_name}
                      {row.is_official && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </div>
                    {row.selling_points?.length > 0 && (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                        {row.selling_points[0]}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary">{CATEGORY_LABELS[row.category]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {[row.era, row.origin].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {new Date(row.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => promoteToOfficial(row)}
                        disabled={!isAdmin || row.is_official} title={row.is_official ? '已是官方' : '提升为官方'}>
                        <ArrowUpCircle className={`w-4 h-4 ${row.is_official ? 'text-primary' : ''}`} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)} disabled={!isAdmin}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive"
                        onClick={() => setSingleDelete(row)} disabled={!isAdmin}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground tabular-nums">
          共 {total} 条 · 第 {page + 1} / {totalPages} 页
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <KnowledgeEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        record={editRecord}
        onSaved={() => { void loadList(); void loadCounts(); }}
      />

      <AlertDialog open={!!singleDelete} onOpenChange={(o) => !o && setSingleDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除「{singleDelete?.product_name}」，此操作无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleSingleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除 {selected.size} 条？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
