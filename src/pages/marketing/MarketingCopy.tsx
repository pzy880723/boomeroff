import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UploadGrid } from './UploadGrid';
import { StepBar } from './StepBar';
import { toast } from 'sonner';


type Platform = 'xhs' | 'douyin' | 'shipinhao' | 'pyq';
const PLATFORMS: { v: Platform; label: string }[] = [
  { v: 'xhs', label: '小红书' }, { v: 'douyin', label: '抖音' }, { v: 'shipinhao', label: '视频号' }, { v: 'pyq', label: '朋友圈' },
];

// 文案口吻 — 分组陈列,每组之间一根古铜金细线
const TONE_GROUPS: { group: string; tones: string[] }[] = [
  { group: '情绪', tones: ['种草', '治愈', '怀旧', '偶遇'] },
  { group: '故事', tones: ['探店', '翻筐日记', '主理人手记', '顾客来信'] },
  { group: '专业', tones: ['藏家分享', '年代考据', '工艺解读'] },
  { group: '推新', tones: ['上新', '限定到店'] },
];

export default function MarketingCopy() {
  const loc = useLocation();

  const initial: string[] = (loc.state as any)?.image_urls || [];
  const [urls, setUrls] = useState<string[]>(initial);
  const [platform, setPlatform] = useState<Platform>('xhs');
  const [tone, setTone] = useState<string>('种草');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [highlight, setHighlight] = useState('');
  const [busy, setBusy] = useState(false);
  const [cands, setCands] = useState<any[]>([]);

  const gen = async () => {
    if (!urls.length) return toast.error('至少上传一张图');
    setBusy(true); setCands([]);
    try {
      const { data, error } = await supabase.functions.invoke('generate-marketing-copy', {
        body: { image_urls: urls, platform, tone, product_name: name, price, highlight },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCands((data as any).candidates || []);
    } catch (e: any) { toast.error(e?.message || '生成失败'); }
    finally { setBusy(false); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('已复制'); };

  return (
    <>
      <PageHeader title="AI 文案" back="/me/marketing" subtitle="营销中心 / 写文案" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">
        <StepBar
          steps={['选图', '平台 / 口吻', '生成', '复制']}
          current={urls.length === 0 ? 0 : cands.length === 0 ? 1 : 3}
        />

        <UploadGrid urls={urls} onChange={setUrls} max={9} preset="thumb" title="素材" />

        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-5">
          <SectionLabel num="01">平台</SectionLabel>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <Chip key={p.v} active={platform === p.v} onClick={() => setPlatform(p.v)}>{p.label}</Chip>
            ))}
          </div>

          <SectionLabel num="02">口吻</SectionLabel>
          <div className="-mt-2 space-y-3">
            {TONE_GROUPS.map((g, gi) => (
              <div key={g.group} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{g.group}</span>
                  <span className="flex-1 h-px bg-accent/15" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.tones.map((t) => (
                    <Chip key={t} active={tone === t} onClick={() => setTone(t)}>{t}</Chip>
                  ))}
                </div>
                {gi < TONE_GROUPS.length - 1 && null}
              </div>
            ))}
          </div>

          <div className="pt-1 space-y-3">
            <UnderlineField label="商品名" value={name} onChange={setName} placeholder="可选" />
            <UnderlineField label="价格" value={price} onChange={setPrice} placeholder="可选" />
            <UnderlineField label="想突出的点" value={highlight} onChange={setHighlight} placeholder="可选" />
          </div>
        </section>

        <Button onClick={gen} disabled={busy || !urls.length} className="w-full h-11 font-medium">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          生成 3 条候选
        </Button>

        {cands.map((c, i) => (
          <section key={i} className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-2.5 animate-card-enter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display text-[11px] text-accent tracking-[0.18em]">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">候选</span>
              </div>
              <button
                onClick={() => copy([c.title, c.body, c.hashtags?.join(' ')].filter(Boolean).join('\n\n'))}
                className="text-muted-foreground hover:text-accent transition-colors"
                aria-label="复制"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {c.title && <p className="font-display text-[17px] leading-snug text-foreground">{c.title}</p>}
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{c.body}</p>
            {c.hashtags?.length > 0 && <p className="text-[11px] text-accent font-medium">{c.hashtags.join(' ')}</p>}
            {c.first_comment && (
              <p className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-2">
                <span className="text-accent font-semibold mr-1">首评</span>{c.first_comment}
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

function SectionLabel({ children, num }: { children: React.ReactNode; num?: string }) {
  return (
    <div className="flex items-center gap-2">
      {num && <span className="font-display text-[11px] text-accent tracking-[0.18em]">{num}</span>}
      <span className="w-1 h-1 rounded-full bg-accent" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{children}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 h-7 rounded-full text-[12px] transition-all border',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-transparent text-foreground border-border hover:border-accent/50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function UnderlineField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">{label}</p>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 text-sm h-9"
      />
    </div>
  );
}
