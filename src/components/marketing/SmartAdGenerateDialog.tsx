import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Store, ShoppingBag, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeFn } from '@/lib/invokeFn';

export type AdKind = 'scene' | 'product' | 'person';
type Aspect = '1:1' | '3:4' | '9:16' | '16:9';
type StyleKey = 'lively' | 'energetic' | 'steady' | 'elegant' | 'nostalgic' | 'playful';
type Realism = 'photoreal' | 'stylized';

const KIND_OPTIONS: { key: AdKind; label: string; desc: string; icon: any }[] = [
  { key: 'scene', label: '场景图', desc: '店内氛围 / 货架陈列', icon: Store },
  { key: 'product', label: '商品特写', desc: '单品居中 / 柔光质感', icon: ShoppingBag },
  { key: 'person', label: '人物图', desc: '真人逛店瞬间 / 电影感', icon: User },
];

const COUNT_OPTIONS = [3, 6, 9, 12];
const ASPECT_OPTIONS: Aspect[] = ['1:1', '3:4', '9:16', '16:9'];
const STYLE_OPTIONS: { key: StyleKey; label: string }[] = [
  { key: 'steady', label: '稳重' },
  { key: 'elegant', label: '优雅' },
  { key: 'lively', label: '活泼' },
  { key: 'nostalgic', label: '怀旧' },
  { key: 'energetic', label: '激动' },
  { key: 'playful', label: '俏皮' },
];

export interface SmartAdResultItem {
  ok: boolean;
  idx: number;
  kind: AdKind;
  output_url?: string;
  source_asset_url?: string;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string | null;
  onResults: (items: SmartAdResultItem[]) => void;
}

export function SmartAdGenerateDialog({ open, onOpenChange, shopId, onResults }: Props) {
  const [kinds, setKinds] = useState<AdKind[]>(['scene', 'product']);
  const [total, setTotal] = useState(9);
  const [aspect, setAspect] = useState<Aspect>('3:4');
  const [style, setStyle] = useState<StyleKey>('steady');
  const [realism, setRealism] = useState<Realism>('photoreal');
  const [styleGrade, setStyleGrade] = useState<'documentary' | 'cinematic'>(() => {
    if (typeof window === 'undefined') return 'documentary';
    return (localStorage.getItem('smart_ad_style_grade') as any) === 'cinematic' ? 'cinematic' : 'documentary';
  });
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleKind = (k: AdKind) => {
    setKinds((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  };

  const submit = async () => {
    if (!shopId) { toast.error('请先选择店铺'); return; }
    if (kinds.length === 0) { toast.error('至少选一种广告图类型'); return; }
    setBusy(true);
    try {
      if (typeof window !== 'undefined') localStorage.setItem('smart_ad_style_grade', styleGrade);
      const { data, error } = await invokeFn('ai-smart-ad-images', {
        body: { shop_id: shopId, kinds, total, aspect, style, realism, theme: theme.trim(), style_grade: styleGrade },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.error || '生成失败');
        return;
      }
      const items: SmartAdResultItem[] = data.items || [];
      const ok = items.filter((x) => x.ok).length;
      const fail = items.length - ok;
      if (ok > 0) toast.success(`生成完成 · 成功 ${ok} 张${fail ? ` · 失败 ${fail} 张` : ''}`);
      else toast.error('全部生成失败,请稍后再试');
      onResults(items);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || '生成失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-accent" />
            一键智能广告图
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1 类型 */}
          <section className="space-y-2">
            <p className="text-[12px] text-muted-foreground">① 选广告图类型(可多选)</p>
            <div className="grid grid-cols-1 gap-2">
              {KIND_OPTIONS.map(({ key, label, desc, icon: Icon }) => {
                const active = kinds.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleKind(key)}
                    className={[
                      'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border hover:border-accent/40',
                    ].join(' ')}
                  >
                    <div className={[
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    ].join(' ')}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 张数 */}
          <section className="space-y-2">
            <p className="text-[12px] text-muted-foreground">② 张数</p>
            <div className="flex gap-2">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setTotal(n)}
                  className={[
                    'flex-1 h-9 rounded-md border text-[13px] transition-colors',
                    total === n ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-accent/40',
                  ].join(' ')}
                >{n} 张</button>
              ))}
            </div>
          </section>

          {/* Step 2.5 比例 */}
          <section className="space-y-2">
            <p className="text-[12px] text-muted-foreground">③ 比例</p>
            <div className="flex gap-2">
              {ASPECT_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={[
                    'flex-1 h-9 rounded-md border text-[12px] transition-colors',
                    aspect === a ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-accent/40',
                  ].join(' ')}
                >{a}</button>
              ))}
            </div>
          </section>

          {/* Step 3 风格 */}
          <section className="space-y-2">
            <p className="text-[12px] text-muted-foreground">④ 风格基调</p>
            <div className="grid grid-cols-3 gap-2">
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStyle(s.key)}
                  className={[
                    'h-8 rounded-md border text-[12px] transition-colors',
                    style === s.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-accent/40',
                  ].join(' ')}
                >{s.label}</button>
              ))}
            </div>
          </section>

          {/* 真人模式(仅人物图相关) */}
          {kinds.includes('person') && (
            <section className="space-y-2">
              <p className="text-[12px] text-muted-foreground">⑤ 人物质感</p>
              <div className="flex gap-2">
                {(['photoreal', 'stylized'] as Realism[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRealism(r)}
                    className={[
                      'flex-1 h-9 rounded-md border text-[12px] transition-colors',
                      realism === r ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-accent/40',
                    ].join(' ')}
                  >{r === 'photoreal' ? '真人写实' : '轻度风格化'}</button>
                ))}
              </div>
            </section>
          )}

          {/* 镜头风格 */}
          <section className="space-y-2">
            <p className="text-[12px] text-muted-foreground">⑥ 镜头风格</p>
            <div className="flex gap-2">
              {([
                { key: 'documentary', label: '纪实风（推荐）', desc: '对齐分镜头，无滤镜、忠于实拍' },
                { key: 'cinematic', label: '电影海报感', desc: '戏剧光影、调色明显' },
              ] as const).map((g) => (
                <button
                  key={g.key}
                  onClick={() => setStyleGrade(g.key)}
                  className={[
                    'flex-1 h-auto py-2 px-2 rounded-md border text-[12px] text-left transition-colors',
                    styleGrade === g.key ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:border-accent/40 text-foreground',
                  ].join(' ')}
                >
                  <div className="font-medium">{g.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{g.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 主题 */}
          <section className="space-y-2">
            <p className="text-[12px] text-muted-foreground">⑦ 主题(可选)</p>
            <Input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder='如:周末新到货 / 夏日清凉 / 学生党捡漏'
              className="h-9 text-[13px]"
            />
            <p className="text-[10px] text-muted-foreground">空着也可,由 BOOMER 自由发挥</p>
          </section>


          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
            <Button className="flex-1 gap-1" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? `生成中…` : `一键生成 ${total} 张`}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            自动从你的素材库挑实拍图作参考 · 出图自动入库
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
