import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_ICONS,
  CATEGORY_BRANDS, CATEGORY_TYPES, ProductCategory,
} from '@/types';
import {
  Loader2, Search, Star, LayoutGrid, ChevronDown, ChevronUp, List, ImageOff,
  Clock, Flame, Award, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AddOfficialFab } from '@/components/library/AddOfficialFab';

interface OfficialItem {
  id: string;
  name: string;
  category: ProductCategory;
  ip_name: string | null;
  brand: string | null;
  sub_type: string | null;
  summary: string | null;
  era: string | null;
  origin: string | null;
  cover_url: string | null;
  selling_points: unknown;
  tips: string | null;
  view_count: number;
  favorite_count: number;
  importance_score: number;
}

const categoriesAll: Array<ProductCategory | 'all'> = ['all', ...CATEGORY_ORDER];
// 默认 2 行 = 12 格：11 个类目 + 第 12 格作为「展开/收起」按钮
const VISIBLE_COUNT = 11;

type ViewMode = 'grid' | 'list';
type SortKey = 'latest' | 'hot' | 'important';

export default function OfficialLibrary() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role, loading: authLoading } = useAuth();
  const isAdmin = role === 'admin';
  const [items, setItems] = useState<OfficialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState(() => searchParams.get('q') || '');
  const [cat, setCat] = useState<ProductCategory | 'all'>(
    () => (searchParams.get('cat') as ProductCategory | null) || 'all',
  );
  const [brand, setBrand] = useState<string>(() => searchParams.get('brand') || searchParams.get('ip') || 'all');
  const [subType, setSubType] = useState<string>(() => searchParams.get('type') || 'all');
  const [era, setEra] = useState<string>(() => searchParams.get('era') || '');
  const [origin, setOrigin] = useState<string>(() => searchParams.get('origin') || '');
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'latest';
    return (localStorage.getItem('lib_sort') as SortKey) || 'latest';
  });
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (localStorage.getItem('lib_view') as ViewMode) || 'grid';
  });
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  // 同步 URL 参数
  useEffect(() => {
    const params: Record<string, string> = {};
    if (cat !== 'all') params.cat = cat;
    if (brand !== 'all') params.brand = brand;
    if (subType !== 'all') params.type = subType;
    if (era) params.era = era;
    if (origin) params.origin = origin;
    if (keyword.trim()) params.q = keyword.trim();
    setSearchParams(params, { replace: true });
  }, [cat, brand, subType, era, origin, keyword, setSearchParams]);

  useEffect(() => {
    localStorage.setItem('lib_view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('lib_view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('lib_sort', sort);
  }, [sort]);

  // 切换一级类目时重置二级（首次挂载若已有 ip 参数则跳过）
  const [catInited, setCatInited] = useState(false);
  useEffect(() => {
    if (!catInited) { setCatInited(true); return; }
    setSub('all');
  }, [cat]);

  // 若选中类目在折叠区外，自动展开
  useEffect(() => {
    if (cat === 'all') return;
    const idx = categoriesAll.indexOf(cat);
    if (idx >= VISIBLE_COUNT) setExpanded(true);
  }, [cat]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let q = supabase.from('official_knowledge').select('*');
      // 仅在「全部」类目下应用排序切换；具体类目固定按更新时间倒序
      if (cat === 'all') {
        if (sort === 'important') {
          q = q.order('importance_score', { ascending: false }).order('updated_at', { ascending: false });
        } else if (sort === 'hot') {
          // 数据库无法直接 order by 表达式，前端再排；先按更新时间初排
          q = q.order('updated_at', { ascending: false });
        } else {
          q = q.order('updated_at', { ascending: false });
        }
      } else {
        q = q.order('updated_at', { ascending: false });
      }
      if (cat !== 'all') q = q.eq('category', cat);
      if (sub !== 'all') q = q.eq('ip_name', sub);
      if (era) q = q.eq('era', era);
      if (origin) q = q.eq('origin', origin);
      if (keyword.trim()) q = q.or(`name.ilike.%${keyword}%,ip_name.ilike.%${keyword}%,summary.ilike.%${keyword}%`);
      const { data } = await q.limit(120);
      let list = (data || []) as OfficialItem[];
      if (cat === 'all' && sort === 'hot') {
        list = [...list].sort(
          (a, b) =>
            (b.favorite_count * 3 + b.view_count) - (a.favorite_count * 3 + a.view_count),
        );
      }
      setItems(list);
      setLoading(false);

      const { data: fav } = await supabase
        .from('user_favorites')
        .select('source_id')
        .eq('user_id', user.id)
        .eq('source_type', 'official');
      setFavoritedIds(new Set((fav || []).map((f) => f.source_id)));
    })();
  }, [user, cat, sub, era, origin, keyword, sort, reloadKey]);

  const toggleFav = async (item: OfficialItem) => {
    if (!user) return;
    if (favoritedIds.has(item.id)) {
      await supabase.from('user_favorites').delete()
        .eq('user_id', user.id).eq('source_type', 'official').eq('source_id', item.id);
      setFavoritedIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
      toast.success('已取消收藏');
    } else {
      await supabase.from('user_favorites').insert({
        user_id: user.id, source_type: 'official', source_id: item.id,
        snapshot: { name: item.name, category: item.category, cover_url: item.cover_url, summary: item.summary },
      });
      setFavoritedIds((s) => new Set(s).add(item.id));
      toast.success('已收藏到个人知识库');
    }
  };

  const openDetail = (it: OfficialItem) => {
    navigate(`/library/${it.id}`);
  };

  const visibleCats = useMemo(
    () => (expanded ? categoriesAll : categoriesAll.slice(0, VISIBLE_COUNT)),
    [expanded],
  );
  const subList = cat !== 'all' ? CATEGORY_SUBCATEGORIES[cat] || [] : [];

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="官方知识库" subtitle="按品类与 IP 学习中古好物" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        {/* 搜索 + 视图切换 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索名称 / IP / 简介"
              className="pl-9"
            />
          </div>
          <div className="flex rounded-md border bg-card overflow-hidden shrink-0">
            <button
              onClick={() => setView('grid')}
              className={`px-2.5 h-10 flex items-center justify-center transition-colors ${
                view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
              aria-label="大图模式"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-2.5 h-10 flex items-center justify-center transition-colors border-l ${
                view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
              aria-label="列表模式"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 当前筛选 chips（年代/产地） */}
        {(era || origin) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {era && (
              <button
                onClick={() => setEra('')}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/20"
              >
                年代：{era}
                <X className="w-3 h-3" />
              </button>
            )}
            {origin && (
              <button
                onClick={() => setOrigin('')}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/20"
              >
                产地：{origin}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* 主类目网格 */}
        <div className="grid grid-cols-6 gap-1.5">
          {visibleCats.map((c) => {
            const active = cat === c;
            const Icon = c === 'all' ? LayoutGrid : CATEGORY_ICONS[c];
            const label = c === 'all' ? '全部' : CATEGORY_LABELS[c];
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] leading-tight truncate max-w-full">{label}</span>
              </button>
            );
          })}
          {/* 展开/收起按钮（占用第 12 / 末尾格） */}
          {categoriesAll.length > VISIBLE_COUNT && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card text-muted-foreground hover:bg-accent px-1 py-2 transition-colors"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="text-[10px] leading-tight">{expanded ? '收起' : '展开'}</span>
            </button>
          )}
        </div>

        {/* 排序切换 - 仅「全部」类目下显示 */}
        {cat === 'all' && (
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {([
              { k: 'latest', label: '最新更新', Icon: Clock },
              { k: 'hot', label: '最热', Icon: Flame },
              { k: 'important', label: '重要程度', Icon: Award },
            ] as const).map(({ k, label, Icon }) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`flex-1 flex items-center justify-center gap-1 h-8 rounded text-xs font-medium transition-colors ${
                  sort === k
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 二级类目 - 上滑时吸顶 */}
        {subList.length > 0 && (
          <div className="sticky top-12 z-20 -mx-3 px-3 py-2 flex gap-1.5 overflow-x-auto bg-background/95 backdrop-blur border-b border-border scrollbar-none">
            <button
              onClick={() => setSub('all')}
              className={`shrink-0 px-3 h-7 rounded-full text-xs border transition-colors ${
                sub === 'all'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >全部</button>
            {subList.map((s) => (
              <button
                key={s}
                onClick={() => setSub(s)}
                className={`shrink-0 px-3 h-7 rounded-full text-xs border transition-colors ${
                  sub === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent'
                }`}
              >{s}</button>
            ))}
          </div>
        )}

        {/* 内容区 */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">
            暂无内容
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3">
            {items.map((it) => (
              <Card key={it.id} className="overflow-hidden cursor-pointer group" onClick={() => openDetail(it)}>
                <div className="aspect-square bg-muted relative">
                  {it.cover_url ? (
                    <img src={it.cover_url} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">无图</div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFav(it); }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/90 backdrop-blur flex items-center justify-center"
                  >
                    <Star className={`w-4 h-4 ${favoritedIds.has(it.id) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                  </button>
                </div>
                <div className="p-2.5 space-y-1">
                  <p className="text-sm font-medium leading-tight truncate">{it.name}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{CATEGORY_LABELS[it.category]}</Badge>
                    {it.ip_name && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{it.ip_name}</Badge>}
                  </div>
                  {it.era && <p className="text-[11px] text-muted-foreground truncate">{it.era}</p>}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <Card
                key={it.id}
                className="flex items-center gap-3 p-2 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => openDetail(it)}
              >
                <div className="w-14 h-14 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                  {it.cover_url ? (
                    <img src={it.cover_url} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <ImageOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium leading-tight truncate">{it.name}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{CATEGORY_LABELS[it.category]}</Badge>
                    {it.ip_name && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{it.ip_name}</Badge>}
                    {it.era && <span className="text-[10px] text-muted-foreground">{it.era}</span>}
                  </div>
                  {it.summary && <p className="text-[11px] text-muted-foreground truncate">{it.summary}</p>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFav(it); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-background"
                >
                  <Star className={`w-4 h-4 ${favoritedIds.has(it.id) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {isAdmin && <AddOfficialFab onAdded={() => setReloadKey((k) => k + 1)} />}
    </>
  );
}
