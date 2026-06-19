import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Store, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  shop_id: string;
  tagline: string | null;
  description: string | null;
  selling_points: any;
  tone: string | null;
  target_audience: string | null;
  brand_keywords: string[] | null;
  cover_image_url: string | null;
  default_hashtags: string[] | null;
}

export function ShopProfilePanel({ shopId, shopName }: { shopId: string; shopName?: string }) {
  const { user } = useAuth();
  const { can } = usePermissions();
  const writable = can('shop.write');
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nlText, setNlText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('shop_marketing_profiles' as any)
        .select('*')
        .eq('shop_id', shopId)
        .maybeSingle();
      setP((data as any) || {
        shop_id: shopId,
        tagline: '', description: '',
        selling_points: [], tone: '', target_audience: '',
        brand_keywords: [], cover_image_url: '', default_hashtags: [],
      });
      setLoading(false);
    })();
  }, [shopId]);

  const csv = (arr: any) => (Array.isArray(arr) ? arr.join(', ') : '');
  const parseCsv = (s: string) => s.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    if (!p || !user) return;
    setSaving(true);
    const payload = {
      shop_id: shopId,
      tagline: p.tagline || null,
      description: p.description || null,
      selling_points: p.selling_points || [],
      tone: p.tone || null,
      target_audience: p.target_audience || null,
      brand_keywords: p.brand_keywords || [],
      cover_image_url: p.cover_image_url || null,
      default_hashtags: p.default_hashtags || [],
      updated_by: user.id,
    };
    const { error } = await supabase
      .from('shop_marketing_profiles' as any)
      .upsert(payload, { onConflict: 'shop_id' });
    setSaving(false);
    if (error) { toast.error(error.message || '保存失败'); return; }
    toast.success('已保存');
  };

  if (loading || !p) {
    return <div className="bg-card rounded-[0.875rem] border border-accent/15 p-6 text-center">
      <Loader2 className="w-4 h-4 animate-spin mx-auto text-accent" />
    </div>;
  }

  const sellingPointsStr = Array.isArray(p.selling_points)
    ? p.selling_points.map((x: any) => typeof x === 'string' ? x : x?.text || '').filter(Boolean).join('\n')
    : '';

  return (
    <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Store className="w-3.5 h-3.5 text-accent" />
        <span className="font-display text-[11px] text-accent tracking-[0.18em]">店铺描述</span>
        <span className="w-1 h-1 rounded-full bg-accent" />
        <span className="text-[12px] text-foreground">{shopName || ''}</span>
        {!writable && <span className="ml-auto text-[10px] text-muted-foreground">只读</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">这些信息会作为 AI 生成图/文/视频时的「店铺画像」上下文。</p>

      {writable && (
        <div className="rounded-lg border border-accent/30 bg-accent/[0.04] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px] font-semibold text-accent">AI 自动填写</span>
            <span className="text-[10px] text-muted-foreground">用自然语言描述，AI 帮你拆成下面这些字段</span>
          </div>
          <Textarea
            rows={3}
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            maxLength={2000}
            placeholder="例：我们是开在东京中野的中古玩具店，主打 80-90 年代日系玩具、老海报和铁皮罐，店里灯光偏暖，客人多是 25-35 岁的女生……"
            className="text-[12px] leading-relaxed bg-card"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={aiBusy || !nlText.trim()}
            onClick={async () => {
              const hasContent = !!(p.tagline || p.description || (Array.isArray(p.selling_points) && p.selling_points.length));
              if (hasContent && !confirm('当前已有店铺描述，AI 生成会覆盖现有内容（你仍可手动微调后再保存）。确定继续？')) return;
              setAiBusy(true);
              try {
                const { data, error } = await supabase.functions.invoke('generate-shop-profile', {
                  body: { text: nlText, shop_id: shopId },
                });
                if (error) throw error;
                if ((data as any)?.error) throw new Error((data as any).error);
                const g = (data as any).profile || {};
                setP({
                  ...p,
                  tagline: g.tagline ?? p.tagline,
                  description: g.description ?? p.description,
                  selling_points: g.selling_points ?? p.selling_points,
                  tone: g.tone ?? p.tone,
                  target_audience: g.target_audience ?? p.target_audience,
                  brand_keywords: g.brand_keywords ?? p.brand_keywords,
                  default_hashtags: g.default_hashtags ?? p.default_hashtags,
                });
                toast.success('已填入，可手动微调后再保存');
              } catch (e: any) {
                toast.error(e?.message || '生成失败');
              } finally {
                setAiBusy(false);
              }
            }}
            className="w-full h-9"
          >
            {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI 一键生成
          </Button>
        </div>
      )}

      <Field label="一句话定位">
        <Input disabled={!writable} value={p.tagline || ''} maxLength={60}
          onChange={(e) => setP({ ...p, tagline: e.target.value })}
          placeholder="如：藏在巷子里的千禧年杂货" />
      </Field>
      <Field label="店铺详细介绍">
        <Textarea disabled={!writable} rows={4} value={p.description || ''} maxLength={500}
          onChange={(e) => setP({ ...p, description: e.target.value })}
          placeholder="选品风格、客群、地段氛围…" />
      </Field>
      <Field label="核心卖点（每行一个）">
        <Textarea disabled={!writable} rows={3}
          value={sellingPointsStr}
          onChange={(e) => setP({
            ...p,
            selling_points: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean),
          })}
          placeholder="昭和玻璃 / 千禧年公仔 / 现场翻筐" />
      </Field>
      <Field label="目标人群">
        <Input disabled={!writable} value={p.target_audience || ''} maxLength={120}
          onChange={(e) => setP({ ...p, target_audience: e.target.value })}
          placeholder="如：22-35 岁，喜欢复古、喜欢逛市集的女生" />
      </Field>
      <Field label="偏好口吻">
        <Input disabled={!writable} value={p.tone || ''} maxLength={40}
          onChange={(e) => setP({ ...p, tone: e.target.value })}
          placeholder="如：治愈 / 克制 / 偶遇感" />
      </Field>
      <Field label="品牌关键词（逗号分隔）">
        <Input disabled={!writable} value={csv(p.brand_keywords)}
          onChange={(e) => setP({ ...p, brand_keywords: parseCsv(e.target.value) })}
          placeholder="昭和, 翻筐, 巷子里" />
      </Field>
      <Field label="默认话题标签（逗号分隔）">
        <Input disabled={!writable} value={csv(p.default_hashtags)}
          onChange={(e) => setP({ ...p, default_hashtags: parseCsv(e.target.value) })}
          placeholder="#中古杂货, #BOOMEROFF" />
      </Field>

      {writable && (
        <Button onClick={save} disabled={saving} className="w-full h-10">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存店铺描述
        </Button>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}
