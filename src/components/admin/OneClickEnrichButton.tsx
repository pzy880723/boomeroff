import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductCategory } from '@/types';

const VALID_CATEGORIES: ProductCategory[] = [
  'jp_porcelain','eu_porcelain','incense','antique_art','local_craft',
  'anime_toy','otaku_goods','luxury','jewelry',
  'game_console','walkman','ccd','media_record','playback_device',
  'home_appliance','hobby','stationery','lacquerware','bronze',
  'woodcraft','textile','painting','porcelain','other',
];

type Stage = 'idle' | 'collect' | 'generate' | 'cover' | 'save' | 'done';
const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  collect: '正在收集当前内容…',
  generate: 'AI 正在重写并补全…',
  cover: '正在生成新封面…',
  save: '正在保存…',
  done: '完成',
};
// 每阶段的目标百分比，进度条会平滑推进到该值
const STAGE_TARGET: Record<Stage, number> = {
  idle: 0, collect: 15, generate: 70, cover: 90, save: 98, done: 100,
};

interface Item {
  id: string;
  name: string;
  category: ProductCategory;
  ip_name: string | null;
  era: string | null;
  origin: string | null;
  summary: string | null;
  tips: string | null;
  body: string | null;
  cover_url: string | null;
  importance_score: number;
  selling_points: unknown;
  content: any;
}

interface Props {
  item: Item;
  onSaved: () => void;
}

const ENRICH_PROMPT = `请把这条词条全部重写到「店员学习卡 + 客户话术卡」最高完成度：
1. 金句更出圈、更有类比；
2. 速记卡 5 条全部填齐，含具体数字；
3. 客户话术 送礼/自用/收藏 三场景各一句；
4. 卖点 4-6 条，每条 tag + 主句 + 展开；
5. 易混对比至少 3 条；
6. 正文按规定的 6 个二级标题写满 800 字以上，含具体年份、人名、价位区间；
7. 店员小贴士补足保养与禁忌。
未提及字段全部增量补强，不得删减或留空。`;

function itemToDraft(it: Item) {
  const c = it.content || {};
  const sp = Array.isArray(it.selling_points)
    ? (it.selling_points as unknown[]).map((p: any) =>
        typeof p === 'string' ? { tag: '', text: p, detail: '' } : p,
      )
    : [];
  return {
    name: it.name,
    category: it.category,
    ip_name: it.ip_name || undefined,
    era: it.era || undefined,
    origin: it.origin || undefined,
    summary: it.summary || undefined,
    tips: it.tips || undefined,
    body: it.body || undefined,
    importance_score: it.importance_score ?? 0,
    selling_points: sp,
    one_liner: c.one_liner || undefined,
    pronunciation: c.pronunciation || undefined,
    aliases: Array.isArray(c.aliases) ? c.aliases : [],
    quick_facts: Array.isArray(c.quick_facts) ? c.quick_facts : [],
    customer_pitches: Array.isArray(c.customer_pitches) ? c.customer_pitches : [],
    comparisons: Array.isArray(c.comparisons) ? c.comparisons : [],
  };
}

export function OneClickEnrichButton({ item, onSaved }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const tickRef = useRef<number | null>(null);

  // 平滑动画推进到当前阶段目标百分比
  useEffect(() => {
    if (stage === 'idle') return;
    const target = STAGE_TARGET[stage];
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setProgress((p) => {
        if (p >= target) return p;
        // 越接近目标越慢
        const step = Math.max(0.4, (target - p) * 0.06);
        return Math.min(target, p + step);
      });
    }, 120);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [stage]);

  const reset = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    setTimeout(() => { setStage('idle'); setProgress(0); }, 800);
  };

  const run = async () => {
    if (stage !== 'idle' && stage !== 'done') return;
    try {
      setProgress(0);
      setStage('collect');
      const currentDraft = itemToDraft(item);

      setStage('generate');
      const { data, error } = await supabase.functions.invoke('generate-official-knowledge', {
        body: {
          messages: [{ role: 'user', content: ENRICH_PROMPT }],
          currentDraft,
        },
      });
      if (error) throw error;
      const newDraft = { ...currentDraft, ...(data?.draft || {}) };
      const newCoverPrompt = data?.cover_prompt as string | undefined;

      let coverUrl = item.cover_url;
      if (newCoverPrompt && !item.cover_url) {
        setStage('cover');
        try {
          const { data: cd } = await supabase.functions.invoke('generate-knowledge-cover', {
            body: { prompt: newCoverPrompt },
          });
          if (cd?.url) coverUrl = cd.url;
        } catch (e) {
          console.warn('cover failed', e);
        }
      }

      setStage('save');
      const safeCategory: ProductCategory = (VALID_CATEGORIES as string[]).includes(newDraft.category as string)
        ? (newDraft.category as ProductCategory) : 'other';
      const sellingPointsJson = (newDraft.selling_points || []).map((p: any) =>
        typeof p === 'string' ? { text: p } : p,
      );
      const payload = {
        name: newDraft.name?.trim() || item.name,
        category: safeCategory,
        ip_name: newDraft.ip_name?.trim() || null,
        era: newDraft.era?.trim() || null,
        origin: newDraft.origin?.trim() || null,
        summary: newDraft.summary?.trim() || null,
        selling_points: sellingPointsJson,
        tips: newDraft.tips?.trim() || null,
        body: newDraft.body?.trim() || null,
        importance_score: Math.min(100, Math.max(0, Number(newDraft.importance_score) || 0)),
        cover_url: coverUrl || null,
        content: {
          one_liner: newDraft.one_liner || null,
          aliases: newDraft.aliases || [],
          pronunciation: newDraft.pronunciation || null,
          quick_facts: newDraft.quick_facts || [],
          customer_pitches: newDraft.customer_pitches || [],
          comparisons: newDraft.comparisons || [],
        },
      };
      const { error: upErr } = await supabase
        .from('official_knowledge')
        .update(payload as any)
        .eq('id', item.id);
      if (upErr) throw upErr;

      setStage('done');
      setProgress(100);
      toast.success('AI 已一键丰富完成');
      onSaved();
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error('一键丰富失败：' + (e?.message ?? ''));
      reset();
    }
  };

  const running = stage !== 'idle' && stage !== 'done';

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        size="sm"
        variant="default"
        onClick={run}
        disabled={running}
        className="h-8 gap-1.5 shadow-md"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {running ? 'AI 丰富中…' : 'AI 一键丰富'}
      </Button>
      {running && (
        <div className="w-44 bg-background/85 backdrop-blur rounded-md px-2 py-1.5 border shadow-sm">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{STAGE_LABEL[stage]}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>
      )}
    </div>
  );
}
