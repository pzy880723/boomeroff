import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Image as ImageIcon, FileText, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function MarketingLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('marketing_assets' as any).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60);
      setItems((data as any[]) || []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <>
      <PageHeader title="素材库" back="/me/marketing" subtitle="营销中心 / 历史产出" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        {loading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
        {!loading && items.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">还没有产出</p>}
        {items.map((it) => (
          <Card key={it.id} className="p-3 flex gap-3">
            <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {it.output_url && it.kind === 'photo' ? (
                <img src={it.output_url} alt="" className="w-full h-full object-cover" />
              ) : it.kind === 'copy' ? (
                <FileText className="w-6 h-6 text-muted-foreground" />
              ) : it.kind === 'video' ? (
                <Video className="w-6 h-6 text-muted-foreground" />
              ) : (
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">{it.kind === 'photo' ? '图片' : it.kind === 'copy' ? '文案' : '视频'}</Badge>
                <span className="text-[11px] text-muted-foreground">{new Date(it.created_at).toLocaleString('zh-CN')}</span>
              </div>
              {it.output_text && <p className="text-xs mt-1 line-clamp-2">{it.output_text.slice(0, 120)}</p>}
              {it.meta?.platform && <p className="text-[11px] text-muted-foreground mt-0.5">平台：{it.meta.platform}</p>}
              {it.kind === 'video' && it.meta?.status && <p className="text-[11px] text-muted-foreground mt-0.5">状态：{it.meta.status}</p>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
