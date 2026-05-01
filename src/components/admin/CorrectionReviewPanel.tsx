import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Check, X, Inbox, MessageSquare, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { CATEGORY_LABELS } from '@/types';

interface PendingItem {
  id: string;
  product_id: string | null;
  image_url: string | null;
  original_payload: any;
  corrected_payload: any;
  user_hint: string;
  conversation: Array<{ role: string; content: string }>;
  submitted_by: string;
  submitted_at: string;
}

export function CorrectionReviewPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pending_corrections')
        .maybeSingle();
      const list = Array.isArray((data?.value as any)?.items) ? (data!.value as any).items : [];
      setItems(list);
    } catch (e) {
      console.error('[CorrectionReview] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const review = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke('review-correction', {
        body: { id, action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setItems((prev) => prev.filter((it) => it.id !== id));
      toast({ title: action === 'approve' ? '已通过并写入官方知识' : '已驳回' });
    } catch (e: any) {
      console.error('[CorrectionReview] review error:', e);
      toast({ title: '操作失败', description: e?.message || '', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">暂无待审核纠错样本</p>
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          共 <span className="font-semibold text-foreground">{items.length}</span> 条待审核
        </p>
        <Button variant="ghost" size="sm" onClick={load} className="h-7 gap-1 text-xs">
          <RefreshCw className="w-3 h-3" />
          刷新
        </Button>
      </div>

      {items.map((it) => {
        const o = it.original_payload || {};
        const c = it.corrected_payload || {};
        return (
          <Card key={it.id} className="overflow-hidden">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex gap-3 items-start">
                {it.image_url ? (
                  <img
                    src={it.image_url}
                    alt={c.name}
                    className="w-20 h-20 rounded-lg object-cover ring-1 ring-border/40 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {new Date(it.submitted_at).toLocaleString('zh-CN', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                      <div className="text-[10px] text-destructive font-medium mb-0.5">原识别</div>
                      <div className="text-sm font-medium">{o.name || '—'}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {[o.era, o.origin, o.material].filter(Boolean).join(' · ') || '无'}
                      </div>
                    </div>
                    <div className="rounded-md border border-success/40 bg-success/5 p-2">
                      <div className="text-[10px] text-success font-medium mb-0.5">纠正后</div>
                      <div className="text-sm font-medium">{c.name || '—'}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {[c.era, c.origin, c.material].filter(Boolean).join(' · ') || '无'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {c.category && (
                  <Badge variant="secondary" className="text-[10px]">
                    {CATEGORY_LABELS[c.category as keyof typeof CATEGORY_LABELS] || c.category}
                  </Badge>
                )}
                {Array.isArray(c.sellingPoints) && c.sellingPoints.slice(0, 3).map((s: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                ))}
              </div>

              {it.user_hint && (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
                  <span className="font-medium text-foreground">提示：</span>{it.user_hint}
                </div>
              )}

              {it.conversation && it.conversation.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs w-full justify-start">
                      <MessageSquare className="w-3 h-3" />
                      查看完整对话（{it.conversation.length} 条）
                      <ChevronDown className="w-3 h-3 ml-auto" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-1.5 pl-2 border-l-2 border-border/60">
                    {it.conversation.map((m, i) => (
                      <div key={i} className="text-xs">
                        <span className={`font-medium ${m.role === 'user' ? 'text-primary' : 'text-muted-foreground'}`}>
                          {m.role === 'user' ? '店员' : 'AI'}：
                        </span>
                        <span className="text-foreground whitespace-pre-wrap">{m.content}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="flex gap-2 pt-1 border-t border-border/40">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => review(it.id, 'reject')}
                  disabled={busyId === it.id}
                  className="flex-1 gap-1.5"
                >
                  {busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  驳回
                </Button>
                <Button
                  size="sm"
                  onClick={() => review(it.id, 'approve')}
                  disabled={busyId === it.id}
                  className="flex-1 gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                >
                  {busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  通过 → 入官方知识
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
