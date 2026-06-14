import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UploadGrid } from './UploadGrid';
import { StepBar } from './StepBar';
import { toast } from 'sonner';


type Platform = 'xhs' | 'douyin' | 'shipinhao' | 'pyq';
type Tone = '种草' | '探店' | '藏家分享' | '上新';
const PLATFORMS: { v: Platform; label: string }[] = [
  { v: 'xhs', label: '小红书' }, { v: 'douyin', label: '抖音' }, { v: 'shipinhao', label: '视频号' }, { v: 'pyq', label: '朋友圈' },
];
const TONES: Tone[] = ['种草', '探店', '藏家分享', '上新'];

export default function MarketingCopy() {
  const { user } = useAuth();
  const loc = useLocation();
  const initial: string[] = (loc.state as any)?.image_urls || [];
  const [urls, setUrls] = useState<string[]>(initial);
  const [platform, setPlatform] = useState<Platform>('xhs');
  const [tone, setTone] = useState<Tone>('种草');
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
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">
        <StepBar
          steps={['选图', '平台/口吻', '生成', '复制发布']}
          current={urls.length === 0 ? 0 : cands.length === 0 ? 1 : 3}
        />
        <UploadGrid urls={urls} onChange={setUrls} max={9} preset="thumb" title="素材" />


        <Card className="p-4 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">平台</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <Badge key={p.v} variant={platform === p.v ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setPlatform(p.v)}>{p.label}</Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">口吻</p>
            <div className="flex flex-wrap gap-1.5">
              {TONES.map((t) => (
                <Badge key={t} variant={tone === t ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setTone(t)}>{t}</Badge>
              ))}
            </div>
          </div>
          <Input placeholder="商品名（可选）" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="价格（可选）" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Input placeholder="想突出的点（可选）" value={highlight} onChange={(e) => setHighlight(e.target.value)} />
        </Card>

        <Button onClick={gen} disabled={busy || !urls.length} className="w-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          生成 3 条候选
        </Button>

        {cands.map((c, i) => (
          <Card key={i} className="p-4 space-y-2">
            {c.title && <p className="font-semibold text-sm">{c.title}</p>}
            <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            {c.hashtags?.length > 0 && <p className="text-xs text-primary">{c.hashtags.join(' ')}</p>}
            {c.first_comment && <p className="text-xs text-muted-foreground">首评：{c.first_comment}</p>}
            <Button size="sm" variant="outline" onClick={() => copy([c.title, c.body, c.hashtags?.join(' ')].filter(Boolean).join('\n\n'))}>
              <Copy className="w-3.5 h-3.5" />复制
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}
