import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FavItem {
  id: string;
  source_type: string;
  source_id: string;
  snapshot: { name?: string; category?: string; cover_url?: string | null; image_url?: string | null; summary?: string };
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = { official: '官方', recognition: '识别', product: '历史' };

export default function MyLibrary() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let q = supabase.from('user_favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('source_type', filter);
      const { data } = await q.limit(200);
      setItems((data || []) as unknown as FavItem[]);
      setLoading(false);
    })();
  }, [user, filter]);

  const remove = async (it: FavItem) => {
    await supabase.from('user_favorites').delete().eq('id', it.id);
    setItems((s) => s.filter((x) => x.id !== it.id));
    toast.success('已移除');
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="个人知识库" subtitle="收藏的好物与识别记录" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="official">官方</TabsTrigger>
            <TabsTrigger value="recognition">识别</TabsTrigger>
            <TabsTrigger value="product">历史</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">
            还没有收藏，去官方知识库或识别商品后收藏吧
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((it) => {
              const cover = it.snapshot?.cover_url || it.snapshot?.image_url;
              return (
                <Card key={it.id} className="overflow-hidden">
                  <div className="aspect-square bg-muted relative">
                    {cover ? (
                      <img src={cover} alt={it.snapshot?.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        <Star className="w-6 h-6" />
                      </div>
                    )}
                    <Badge className="absolute top-2 left-2 text-[10px]" variant="secondary">
                      {TYPE_LABEL[it.source_type] || it.source_type}
                    </Badge>
                  </div>
                  <div className="p-2.5 space-y-2">
                    <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">
                      {it.snapshot?.name || '未命名'}
                    </p>
                    <Button size="sm" variant="ghost" className="w-full h-7 text-xs text-muted-foreground" onClick={() => remove(it)}>
                      <Trash2 className="w-3 h-3 mr-1" /> 移除
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
