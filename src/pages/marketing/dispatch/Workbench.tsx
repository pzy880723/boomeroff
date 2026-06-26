// 发布工作台:选素材(URL 参数预填) -> 选账号 -> 编辑分平台文案 -> 立即发或定时
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveShop } from '@/hooks/useShops';
import { useToast } from '@/hooks/use-toast';
import { PlatformBadge, platformLabel } from '@/components/marketing/dispatch/PlatformBadge';
import type { PlatformSpec, SocialAccount } from '@/lib/dispatch';

export default function Workbench() {
  const { shopId } = useEffectiveShop();
  const { toast } = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const presetAssetId = sp.get('asset_id') || '';

  const [asset, setAsset] = useState<any>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [specs, setSpecs] = useState<Record<string, PlatformSpec>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [perPlatform, setPerPlatform] = useState<Record<string, { title?: string; tags?: string }>>({});
  const [scheduleAt, setScheduleAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    if (!presetAssetId) return;
    (async () => {
      const { data } = await supabase.from('marketing_assets').select('*').eq('id', presetAssetId).maybeSingle();
      if (data) {
        setAsset(data);
        const meta = (data.meta as any) || {};
        setTitle(((meta.note_title || meta.title || '') as string).slice(0, 30));
        setBody((meta.note_body || data.output_text || '') as string);
        setTagsRaw(((data.tags as string[]) || []).join(' '));
      }
    })();
  }, [presetAssetId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('social_platform_specs').select('*').eq('enabled', true);
      const map: Record<string, PlatformSpec> = {};
      (data || []).forEach((s: any) => { map[s.platform] = s; });
      setSpecs(map);
    })();
  }, []);

  useEffect(() => {
    if (!shopId) return;
    (async () => {
      setLoadingAccounts(true);
      const { data } = await supabase.functions.invoke('dispatch-account-list', { body: { shop_id: shopId } });
      setAccounts((data?.accounts || []) as SocialAccount[]);
      setLoadingAccounts(false);
    })();
  }, [shopId]);

  const selectedAccounts = useMemo(() => accounts.filter((a) => selected[a.id]), [accounts, selected]);
  const selectedPlatforms = useMemo(() => Array.from(new Set(selectedAccounts.map((a) => a.platform))), [selectedAccounts]);

  const tags = tagsRaw.split(/[\s,，]+/).filter(Boolean).map((t) => t.replace(/^#/, ''));

  const submit = async () => {
    if (!asset && !presetAssetId) { toast({ title: '请先选择素材', variant: 'destructive' }); return; }
    if (selectedAccounts.length === 0) { toast({ title: '请至少勾一个账号', variant: 'destructive' }); return; }
    if (!title.trim()) { toast({ title: '请填标题', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const pp: Record<string, any> = {};
      Object.entries(perPlatform).forEach(([p, v]) => {
        const obj: any = {};
        if (v.title) obj.title = v.title;
        if (v.tags) obj.tags = v.tags.split(/[\s,，]+/).filter(Boolean).map((t) => t.replace(/^#/, ''));
        if (Object.keys(obj).length) pp[p] = obj;
      });
      const { data, error } = await supabase.functions.invoke('dispatch-job-create', {
        body: {
          asset_id: presetAssetId || asset?.id,
          kind: 'video',
          account_ids: selectedAccounts.map((a) => a.id),
          title, body, tags,
          per_platform: pp,
          schedule_at: scheduleAt || null,
        },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: data?.scheduled ? '已加入定时' : '已提交,正在发布' });
      if (data?.job_id) nav(`/me/marketing/dispatch/job/${data.job_id}`);
      else nav('/me/marketing/dispatch?tab=history');
    } catch (e: any) {
      toast({ title: '提交失败', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-32 bg-background">
      <PageHeader title="发布工作台" back="/me/marketing/dispatch" />

      <div className="px-4 space-y-5 pt-3">
        {/* 1. 素材 */}
        <section>
          <div className="text-[11px] text-muted-foreground mb-1.5 tracking-wider">1. 素材</div>
          {asset ? (
            <div className="flex items-center gap-3 p-3 bg-card rounded-xl border">
              {(asset.meta?.poster_url || asset.output_url) ? (
                <img src={asset.meta?.poster_url || asset.output_url} className="w-14 h-20 rounded-md object-cover" />
              ) : <div className="w-14 h-20 rounded-md bg-muted" />}
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-medium truncate">{(asset.meta as any)?.title || '视频素材'}</div>
                <div className="text-muted-foreground mt-1">{asset.kind === 'video' ? '视频' : '图文'}</div>
              </div>
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-6 border-2 border-dashed rounded-xl">
              请从素材库点 ✈️ 一键发布 进入,或直接在浏览器打开 ?asset_id=xxx
            </div>
          )}
        </section>

        {/* 2. 账号 */}
        <section>
          <div className="text-[11px] text-muted-foreground mb-1.5 tracking-wider flex items-center justify-between">
            <span>2. 选账号(已勾 {selectedAccounts.length})</span>
            <button className="text-primary text-[11px]" onClick={() => nav('/me/marketing/dispatch?tab=accounts')}>+ 添加</button>
          </div>
          {loadingAccounts ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : accounts.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6 border-2 border-dashed rounded-xl">
              还没绑定账号
            </div>
          ) : (
            <div className="space-y-1.5">
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-3 p-2.5 bg-card rounded-lg border cursor-pointer">
                  <Checkbox checked={!!selected[a.id]} onCheckedChange={(v) => setSelected({ ...selected, [a.id]: !!v })} />
                  <PlatformBadge platform={a.platform} size="sm" />
                  <span className="text-sm flex-1 truncate">{a.account_name || '未命名'}</span>
                  {a.online === false && <span className="text-[10px] text-rose-600">已失效</span>}
                </label>
              ))}
            </div>
          )}
        </section>

        {/* 3. 通用文案 */}
        <section>
          <div className="text-[11px] text-muted-foreground mb-1.5 tracking-wider">3. 通用文案(可在下方为每个平台单独调整)</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题" maxLength={100} className="mb-2" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="正文/描述" rows={3} className="mb-2" />
          <Input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="话题(空格或逗号分隔,如 夏季 新品)" />
        </section>

        {/* 4. 分平台覆盖 */}
        {selectedPlatforms.length > 0 && (
          <section>
            <div className="text-[11px] text-muted-foreground mb-1.5 tracking-wider">4. 分平台微调(留空就用上面通用文案)</div>
            <div className="space-y-2">
              {selectedPlatforms.map((p) => {
                const spec = specs[p];
                const v = perPlatform[p] || {};
                const curTitle = v.title ?? title;
                const overTitle = spec && curTitle.length > spec.title_max;
                return (
                  <div key={p} className="p-3 bg-card rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2"><PlatformBadge platform={p} size="sm" /><span className="text-sm font-medium">{platformLabel(p)}</span></div>
                      {spec && <span className={`text-[10px] ${overTitle ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>标题 {curTitle.length}/{spec.title_max}</span>}
                    </div>
                    <Input
                      value={v.title ?? ''}
                      onChange={(e) => setPerPlatform({ ...perPlatform, [p]: { ...v, title: e.target.value } })}
                      placeholder={`标题(留空=${title.slice(0, 20)}…)`}
                      className="mb-1.5 h-8 text-xs"
                    />
                    <Input
                      value={v.tags ?? ''}
                      onChange={(e) => setPerPlatform({ ...perPlatform, [p]: { ...v, tags: e.target.value } })}
                      placeholder={`话题(留空=${tagsRaw || '无'})`}
                      className="h-8 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 5. 定时 */}
        <section>
          <div className="text-[11px] text-muted-foreground mb-1.5 tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> 5. 定时(留空=立即发布)
          </div>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        </section>
      </div>

      {/* 提交 */}
      <div className="fixed left-0 right-0 bottom-0 bg-background/95 backdrop-blur border-t px-4 py-3 z-30">
        <Button
          className="w-full h-12 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 text-white text-base"
          onClick={submit}
          disabled={submitting || selectedAccounts.length === 0 || !title.trim()}
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          {scheduleAt ? '加入定时发布' : `立即发布到 ${selectedAccounts.length} 个账号`}
        </Button>
      </div>
    </div>
  );
}
