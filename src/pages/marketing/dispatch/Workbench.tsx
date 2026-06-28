// 发布工作台:选素材(视频/图文) -> 选账号(按支持类型灰度) -> AI 文案 -> 立即发或定时
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Send, Calendar, Image as ImageIcon, Film, Sparkles, FolderOpen } from 'lucide-react';
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
import { LibraryAssetPickerDialog, type PickedAsset } from './LibraryAssetPickerDialog';
import { AiCopySheet } from './AiCopySheet';
import { invokeFn } from '@/lib/invokeFn';

type Kind = 'video' | 'image_text';

export default function Workbench() {
  const { shopId } = useEffectiveShop();
  const { toast } = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const presetAssetId = sp.get('asset_id') || '';

  const [kind, setKind] = useState<Kind>('video');
  const [asset, setAsset] = useState<any>(null);          // 视频素材对象
  const [images, setImages] = useState<string[]>([]);     // 图文图片 url 列表
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // URL 预填(默认视频)
  useEffect(() => {
    if (!presetAssetId) return;
    (async () => {
      const { data } = await supabase.from('marketing_assets').select('*').eq('id', presetAssetId).maybeSingle();
      if (data) {
        setAsset(data);
        setKind(data.kind === 'photo' ? 'image_text' : 'video');
        if (data.kind === 'photo' && data.output_url) setImages([data.output_url]);
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
      const { data } = await invokeFn('dispatch-account-list', { body: { shop_id: shopId } });
      setAccounts((data?.accounts || []) as SocialAccount[]);
      setLoadingAccounts(false);
    })();
  }, [shopId]);

  // 平台是否支持当前 kind
  const supports = (platform: string): { ok: boolean; reason?: string } => {
    const s = specs[platform];
    if (!s) return { ok: true }; // 未配置时不阻塞
    if (kind === 'video') {
      if (!s.supports_video) return { ok: false, reason: '不支持视频' };
    } else {
      if (!s.supports_image_text) return { ok: false, reason: '不支持图文' };
      if (images.length && (images.length < s.images_min || images.length > s.images_max)) {
        return { ok: false, reason: `需 ${s.images_min}-${s.images_max} 张` };
      }
    }
    return { ok: true };
  };

  // 切换 kind 或 images 数量变化时,自动取消不兼容的账号
  useEffect(() => {
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      let dropped = 0;
      accounts.forEach((a) => {
        if (prev[a.id]) {
          if (supports(a.platform).ok) next[a.id] = true;
          else dropped++;
        }
      });
      if (dropped > 0) toast({ title: `已取消 ${dropped} 个不兼容账号`, description: '当前素材类型该平台暂不支持' });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, images.length, accounts.length, Object.keys(specs).length]);

  const selectedAccounts = useMemo(() => accounts.filter((a) => selected[a.id]), [accounts, selected]);
  const selectedPlatforms = useMemo(() => Array.from(new Set(selectedAccounts.map((a) => a.platform))), [selectedAccounts]);
  const tags = tagsRaw.split(/[\s,，]+/).filter(Boolean).map((t) => t.replace(/^#/, ''));

  const onPicked = (p: PickedAsset) => {
    if (p.kind === 'video') {
      setAsset(p.asset);
      setKind('video');
      setImages([]);
      const meta = (p.asset.meta as any) || {};
      if (!title) setTitle(((meta.note_title || meta.title || '') as string).slice(0, 30));
      if (!body) setBody((meta.note_body || p.asset.output_text || '') as string);
      if (!tagsRaw) setTagsRaw(((p.asset.tags as string[]) || []).join(' '));
    } else {
      setAsset(null);
      setKind('image_text');
      setImages(p.images);
    }
  };

  const aiSourceImages = useMemo(() => {
    if (kind === 'image_text') return images;
    if (asset) {
      const meta = (asset.meta as any) || {};
      const u = meta.poster_url || meta.cover_url || asset.output_url;
      return u ? [u] : [];
    }
    return [];
  }, [kind, images, asset]);

  const submit = async () => {
    if (kind === 'video' && !asset) { toast({ title: '请先选视频素材', variant: 'destructive' }); return; }
    if (kind === 'image_text' && images.length === 0) { toast({ title: '请先选图片', variant: 'destructive' }); return; }
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
      const payload: any = {
        kind,
        account_ids: selectedAccounts.map((a) => a.id),
        title, body, tags,
        per_platform: pp,
        schedule_at: scheduleAt || null,
      };
      if (kind === 'video') payload.asset_id = asset?.id;
      else payload.images = images;
      const { data, error } = await invokeFn('dispatch-job-create', { body: payload });
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

  const aiPlatform = selectedPlatforms.length === 1 ? selectedPlatforms[0] : 'xhs';

  return (
    <div className="min-h-screen pb-32 bg-background">
      <PageHeader title="发布工作台" back="/me/marketing/dispatch" />

      <div className="px-4 space-y-5 pt-3">
        {/* 1. 素材类型 + 选择 */}
        <section>
          <div className="text-[11px] text-muted-foreground mb-1.5 tracking-wider">1. 素材</div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { setKind('video'); }}
              className={['flex-1 h-9 rounded-lg border text-xs flex items-center justify-center gap-1.5 transition',
                kind === 'video' ? 'bg-accent text-accent-foreground border-accent' : 'bg-card'].join(' ')}>
              <Film className="w-3.5 h-3.5" /> 视频
            </button>
            <button
              onClick={() => { setKind('image_text'); setAsset(null); }}
              className={['flex-1 h-9 rounded-lg border text-xs flex items-center justify-center gap-1.5 transition',
                kind === 'image_text' ? 'bg-accent text-accent-foreground border-accent' : 'bg-card'].join(' ')}>
              <ImageIcon className="w-3.5 h-3.5" /> 图文
            </button>
          </div>

          {kind === 'video' && asset ? (
            <div className="flex items-center gap-3 p-3 bg-card rounded-xl border">
              {(asset.meta?.poster_url || asset.output_url) ? (
                <img src={asset.meta?.poster_url || asset.output_url} className="w-14 h-20 rounded-md object-cover" />
              ) : <div className="w-14 h-20 rounded-md bg-muted" />}
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-medium truncate">{(asset.meta as any)?.title || '视频素材'}</div>
                <div className="text-muted-foreground mt-1">视频</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>换</Button>
            </div>
          ) : kind === 'image_text' && images.length > 0 ? (
            <div className="p-3 bg-card rounded-xl border">
              <div className="grid grid-cols-5 gap-1.5">
                {images.map((u, i) => (
                  <div key={i} className="relative aspect-square rounded overflow-hidden">
                    <img src={u} className="w-full h-full object-cover" />
                    <span className="absolute top-0.5 left-0.5 text-[9px] bg-foreground/60 text-background px-1 rounded">{i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[11px] text-muted-foreground">{images.length} 张</span>
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>换</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setPickerOpen(true)}
              className="w-full py-6 border-2 border-dashed rounded-xl text-sm text-muted-foreground flex items-center justify-center gap-2 hover:border-accent hover:text-accent transition">
              <FolderOpen className="w-4 h-4" /> 从素材库选{kind === 'video' ? '视频' : '图片(1-9 张)'}
            </button>
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
            <div className="text-center text-sm text-muted-foreground py-6 border-2 border-dashed rounded-xl">还没绑定账号</div>
          ) : (
            <div className="space-y-1.5">
              {accounts.map((a) => {
                const sup = supports(a.platform);
                const disabled = !sup.ok;
                return (
                  <label key={a.id}
                    className={['flex items-center gap-3 p-2.5 bg-card rounded-lg border transition',
                      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'].join(' ')}>
                    <Checkbox
                      checked={!!selected[a.id]}
                      disabled={disabled}
                      onCheckedChange={(v) => setSelected({ ...selected, [a.id]: !!v })}
                    />
                    <PlatformBadge platform={a.platform} size="sm" />
                    <span className="text-sm flex-1 truncate">{a.account_name || '未命名'}</span>
                    {disabled && <span className="text-[10px] text-muted-foreground">{sup.reason}</span>}
                    {!disabled && a.online === false && <span className="text-[10px] text-rose-600">已失效</span>}
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* 3. 通用文案 + AI */}
        <section>
          <div className="text-[11px] text-muted-foreground mb-1.5 tracking-wider flex items-center justify-between">
            <span>3. 通用文案</span>
            <button
              onClick={() => setAiOpen(true)}
              disabled={aiSourceImages.length === 0}
              className="text-[11px] text-accent flex items-center gap-1 disabled:opacity-40">
              <Sparkles className="w-3 h-3" /> AI 一键生成
            </button>
          </div>
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
          className="w-full h-12 bg-primary text-primary-foreground text-base"
          onClick={submit}
          disabled={submitting || selectedAccounts.length === 0 || !title.trim()}
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          {scheduleAt ? '加入定时发布' : `立即发布到 ${selectedAccounts.length} 个账号`}
        </Button>
      </div>

      <LibraryAssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        shopId={shopId}
        defaultTab={kind}
        onConfirm={onPicked}
      />
      <AiCopySheet
        open={aiOpen}
        onOpenChange={setAiOpen}
        imageUrls={aiSourceImages}
        platform={aiPlatform}
        shopId={shopId}
        onPick={(c) => {
          if (c.title) setTitle(c.title.slice(0, 100));
          if (c.body) setBody(c.body);
          if (c.hashtags?.length) setTagsRaw(c.hashtags.map(t => t.replace(/^#/, '')).join(' '));
          toast({ title: '已填入文案' });
        }}
      />
    </div>
  );
}
