import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Quote, Volume2, Square, Copy, Sparkles } from 'lucide-react';
import { KnowledgeCard } from '@/lib/knowledgeCard';
import { useSpeech } from '@/hooks/useSpeech';
import { toast } from 'sonner';

interface Props {
  card: KnowledgeCard | null;
  loading?: boolean;
  /** 占位提示文案，例如「正在为本次识别生成知识卡…」 */
  loadingText?: string;
}

/**
 * 共享「知识卡」渲染：金句 / 速记卡 / 客户话术 / 富卖点 / 易混对比 / 别名读音
 * 用于：官方知识详情、个人识别历史、个人手建词条、AI 识别结果
 * 不渲染 body（深度阅读）
 */
export function KnowledgeCardSections({ card, loading, loadingText }: Props) {
  const { isSpeaking, speak, stop } = useSpeech();
  const speakOrStop = (t: string) => (isSpeaking ? stop() : speak(t));
  const copyText = (t: string) =>
    navigator.clipboard.writeText(t).then(
      () => toast.success('已复制'),
      () => toast.error('复制失败'),
    );

  if (!card) {
    if (!loading) return null;
    return (
      <Card className="p-3 text-xs text-muted-foreground border-dashed flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary" />
        {loadingText || '正在生成知识卡…（约 5-15 秒）'}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {(card.pronunciation || (card.aliases && card.aliases.length > 0)) && (
        <div className="text-xs text-muted-foreground space-x-2">
          {card.pronunciation && <span>{card.pronunciation}</span>}
          {card.aliases && card.aliases.length > 0 && (
            <span>· 别名：{card.aliases.join(' / ')}</span>
          )}
        </div>
      )}

      {card.one_liner && (
        <Card className="p-4 bg-gradient-to-br from-primary/15 via-accent/20 to-background border-primary/30">
          <div className="flex items-start gap-3">
            <Quote className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                一句话讲给客人
              </div>
              <div className="text-lg font-semibold leading-snug">{card.one_liner}</div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speakOrStop(card.one_liner!)}>
                {isSpeaking ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyText(card.one_liner!)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {card.quick_facts && card.quick_facts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">速记卡</h2>
          <div className="grid grid-cols-2 gap-2">
            {card.quick_facts.map((f, i) => (
              <div key={i} className="rounded-lg border bg-muted/20 p-2.5">
                <div className="text-[10px] text-muted-foreground">{f.label}</div>
                <div className="text-sm font-medium leading-tight mt-0.5">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.customer_pitches && card.customer_pitches.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">客户话术</h2>
          <div className="space-y-2">
            {card.customer_pitches.map((p, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">{p.scene}</Badge>
                  <div className="flex-1 text-sm leading-relaxed">{p.line}</div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => speakOrStop(p.line)}
                  >
                    {isSpeaking ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {card.selling_points_rich && card.selling_points_rich.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">核心卖点</h2>
          <ul className="space-y-2.5">
            {card.selling_points_rich.map((p, i) => (
              <li key={i} className="rounded-lg border bg-muted/10 p-3">
                <div className="flex items-baseline gap-2">
                  {p.tag && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/40 text-accent-foreground shrink-0">
                      {p.tag}
                    </span>
                  )}
                  <span className="text-[15px] font-medium leading-snug">{p.text}</span>
                </div>
                {p.detail && (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{p.detail}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.comparisons && card.comparisons.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">易混对比</h2>
          <div className="space-y-1.5">
            {card.comparisons.map((c, i) => (
              <Card key={i} className="p-3 text-sm">
                <span className="font-semibold text-primary">vs {c.name}：</span>
                <span className="text-foreground/85 leading-relaxed">{c.diff}</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-[11px] text-muted-foreground text-center py-1.5 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3 h-3 animate-pulse text-primary" />
          知识卡还在补充中…
        </div>
      )}
    </div>
  );
}
