// AI 一键生成标题/正文/话题:调 generate-marketing-copy,3 条候选选一条回填
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Candidate = { title?: string; body?: string; hashtags?: string[]; first_comment?: string };

export function AiCopySheet({
  open, onOpenChange, imageUrls, platform, shopId, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrls: string[];
  platform: string; // xhs/douyin/...
  shopId: string | null;
  onPick: (c: Candidate) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<Candidate[]>([]);

  const run = async () => {
    if (imageUrls.length === 0) { toast.error('没有可分析的封面/图片'); return; }
    setLoading(true); setList([]);
    try {
      const { data, error } = await supabase.functions.invoke('generate-marketing-copy', {
        body: { image_urls: imageUrls.slice(0, 9), platform, tone: '种草', shop_id: shopId },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const cands: Candidate[] = (data as any)?.candidates || [];
      if (!cands.length) throw new Error('AI 没有返回内容');
      setList(cands);
    } catch (e: any) {
      toast.error('生成失败', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" /> AI 一键生成文案
          </SheetTitle>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          {list.length === 0 && !loading && (
            <Button onClick={run} className="w-full bg-primary text-primary-foreground">
              <Sparkles className="w-4 h-4 mr-1.5" /> 开始生成 3 条候选
            </Button>
          )}
          {loading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />
              AI 正在看图写文…
            </div>
          )}
          {list.map((c, i) => (
            <button key={i}
              onClick={() => { onPick(c); onOpenChange(false); }}
              className="w-full text-left p-3 rounded-xl border bg-card hover:border-accent active:scale-[0.99] transition">
              <div className="text-xs text-muted-foreground mb-1">候选 {i + 1}</div>
              {c.title && <div className="text-sm font-semibold mb-1 line-clamp-2">{c.title}</div>}
              {c.body && <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{c.body}</div>}
              {c.hashtags && c.hashtags.length > 0 && (
                <div className="mt-1.5 text-[11px] text-accent">{c.hashtags.slice(0, 8).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}</div>
              )}
            </button>
          ))}
          {list.length > 0 && (
            <Button variant="outline" className="w-full" onClick={run} disabled={loading}>重新生成</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
