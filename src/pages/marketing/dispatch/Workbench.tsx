// 发布工作台:选素材(视频/图文) -> 选账号(按支持类型灰度) -> AI 文案 -> 立即发或定时
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
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
import {
  buildDefaultAccountSelection,
  isPublishableAccount,
  PUBLISH_PLATFORMS,
  resolvePublishDraft,
} from '@/lib/publishFlow';

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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const autoSelectionKey = useRef('');

  // URL 预填(默认视频)
  useEffect(() => {
    if (!presetAssetId) return;
    (async () => {
      const { data } = await supabase.from('marketing_assets').select('*').eq('id', presetAssetId).maybeSingle();
      if (data) {
        setAsset(data);
        setKind(data.kind === 'photo' ? 'image_text' : 'video');
        if (data.kind === 'photo' && data.output_url) setImages([data.output_url]);
        const draft = resolvePublishDraft(data);
        setTitle(draft.title);
        setBody(draft.body);
        setTagsRaw(draft.tagsRaw);
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

  const visibleAccounts = useMemo(
    () => accounts.filter((account) => PUBLISH_PLATFORMS.includes(account.platform as any)),
    [accounts],
  );

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
      visibleAccounts.forEach((a) => {
        if (prev[a.id]) {
          if (supports(a.platform).ok && isPublishableAccount(a)) next[a.id] = true;
          else dropped++;
        }
      });
      if (dropped > 0) toast({ title: `已取消 ${dropped} 个不兼容账号`, description: '当前素材类型该平台暂不支持' });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, images.length, visibleAccounts.length, Object.keys(specs).length]);

  // 首次进入、切换门店或素材类型时，默认选择全部可发布账号。
  useEffect(() => {
    if (!visibleAccounts.length || !Object.keys(specs).length) return;
    const key = [
      shopId || '',
      kind,
      images.length,
      visibleAccounts.map((account) => `${account.id}:${account.online}:${account.cookie_status}`).join('|'),
      Object.keys(specs).sort().join('|'),
    ].join('::');
    if (autoSelectionKey.current === key) return;
    autoSelectionKey.current = key;
    setSelected(buildDefaultAccountSelection(visibleAccounts, (platform) => supports(platform).ok));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, kind, images.length, visibleAccounts, specs]);

  const selectedAccounts = useMemo(
    () => visibleAccounts.filter((account) => selected[account.id] && isPublishableAccount(account)),
    [visibleAccounts, selected],
  );
  const selectedPlatforms = useMemo(() => Array.from(new Set(selectedAccounts.map((a) => a.platform))), [selectedAccounts]);
  const tags = tagsRaw.split(/[\s,，]+/).filter(Boolean).map((t) => t.replace(/^#/, ''));

  const onPicked = (p: PickedAsset) => {
    if (p.kind === 'video') {
      setAsset(p.asset);
      setKind('video');
      setImages([]);
      const draft = resolvePublishDraft(p.asset);
      setTitle(draft.title);
      setBody(draft.body);
      setTagsRaw(draft.tagsRaw);
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
      toast({ title: data?.scheduled ? '已加入定时' : '已提交到发布队列' });
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
    <div className="min-h-screen pb-32 bg-muted/25">
      <PageHeader title="新建发布" back="/me/marketing/dispatch" subtitle="选内容 → 确认文案 → 选择账号 → 发布" />

      <main className="container mx-auto max-w-screen-md px-4 pt-3 space-y-3">
        <div className="flex items-center px-1 pb-1">
          {[1, 2, 3, 4].map((step, index) => (
            <div key={step} className={`flex items-center ${index < 3 ? 'flex-1' : ''}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${
                step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {step}
              </span>
              {index < 3 && <span className="mx-1 h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        <section className="rounded-2xl border bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">1. 选择内容</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">视频或 1-9 张图片</div>
            </div>
            <div className="flex rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => { setKind('video'); setImages([]); autoSelectionKey.current = ''; }}
                className={`flex h-8 items-center gap-1 rounded-md px-2.5 text-[11px] ${
                  kind === 'video' ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <Film className="h-3.5 w-3.5" />视频
              </button>
              <button
                type="button"
                onClick={() => { setKind('image_text'); setAsset(null); autoSelectionKey.current = ''; }}
                className={`flex h-8 items-center gap-1 rounded-md px-2.5 text-[11px] ${
                  kind === 'image_text' ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />图文
              </button>
            </div>
          </div>

          {kind === 'video' && asset ? (
            <div className="flex items-center gap-3 rounded-xl bg-muted/45 p-2.5">
              {(asset.meta?.poster_url || asset.meta?.cover_url || asset.output_url) ? (
                <img
                  src={asset.meta?.poster_url || asset.meta?.cover_url || asset.output_url}
                  alt=""
                  className="h-20 w-14 rounded-lg object-cover"
                />
              ) : <div className="h-20 w-14 rounded-lg bg-muted" />}
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-semibold">
                  {(asset.meta as any)?.video_copy?.title || (asset.meta as any)?.title || '视频素材'}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">AIGC 素材库 · 文案自动带入</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>更换</Button>
            </div>
          ) : kind === 'image_text' && images.length > 0 ? (
            <div className="rounded-xl bg-muted/45 p-2.5">
              <div className="grid grid-cols-5 gap-1.5">
                {images.map((url, index) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-lg">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] text-white">{index + 1}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">已选 {images.length} 张</span>
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>更换</Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-7 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              <FolderOpen className="h-4 w-4" />从素材库选择{kind === 'video' ? '视频' : '图片'}
            </button>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">2. 确认发布文案</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">AIGC 文案只生成一次，可在这里修改</div>
            </div>
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              disabled={aiSourceImages.length === 0}
              className="flex items-center gap-1 text-[11px] font-medium text-primary disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />重新生成
            </button>
          </div>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题" maxLength={100} className="mb-2" />
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="正文/描述" rows={4} className="mb-2" />
          <Input value={tagsRaw} onChange={(event) => setTagsRaw(event.target.value)} placeholder="话题，例如：上海探店 中古杂货" />
        </section>

        <section className="rounded-2xl border bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">3. 发布平台与账号</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">默认全选全部正常账号</div>
            </div>
            <button type="button" className="text-[11px] font-medium text-primary" onClick={() => nav('/me/marketing/dispatch?tab=accounts')}>
              管理账号
            </button>
          </div>

          {loadingAccounts ? (
            <div className="flex justify-center py-7 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : visibleAccounts.length === 0 ? (
            <button
              type="button"
              onClick={() => nav('/me/marketing/dispatch?tab=accounts')}
              className="w-full rounded-xl border-2 border-dashed py-7 text-sm text-muted-foreground"
            >
              还没有绑定账号，点击去添加
            </button>
          ) : (
            <div className="space-y-2">
              {visibleAccounts.map((account) => {
                const support = supports(account.platform);
                const available = isPublishableAccount(account);
                const disabled = !support.ok || !available;
                const reason = !support.ok
                  ? support.reason
                  : account.cookie_status === 'expired'
                    ? '登录失效'
                    : account.online === false
                      ? '账号离线'
                      : '未完成登录';
                return (
                  <label
                    key={account.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      disabled ? 'cursor-not-allowed bg-muted/50 opacity-65' : 'cursor-pointer bg-background'
                    }`}
                  >
                    <Checkbox
                      checked={Boolean(selected[account.id])}
                      disabled={disabled}
                      onCheckedChange={(checked) => setSelected((current) => ({
                        ...current,
                        [account.id]: Boolean(checked),
                      }))}
                    />
                    <PlatformBadge platform={account.platform} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{account.account_name || '未命名账号'}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{platformLabel(account.platform)}</div>
                    </div>
                    {disabled ? (
                      <span className="text-[10px] font-medium text-rose-600">{reason}</span>
                    ) : (
                      <span className="text-[10px] font-medium text-emerald-600">可发布</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {visibleAccounts.some((account) => !isPublishableAccount(account)) && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-[10px] leading-4 text-rose-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              失效账号会自动跳过，不会阻断其他平台。
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">4. 发布时间</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">留空就是立即发布，提交后可安全退出</div>
            </div>
          </div>
          <Input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
        </section>

        {selectedPlatforms.length > 0 && (
          <section className="rounded-2xl border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              className="flex w-full items-center justify-between p-3.5 text-left"
            >
              <div>
                <div className="text-sm font-semibold">高级设置</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">按平台单独修改标题和话题，普通发布不用调整</div>
              </div>
              {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {advancedOpen && (
              <div className="space-y-2 border-t px-3.5 pb-3.5 pt-3">
                {selectedPlatforms.map((platform) => {
                  const spec = specs[platform];
                  const value = perPlatform[platform] || {};
                  const currentTitle = value.title ?? title;
                  const overTitle = spec && currentTitle.length > spec.title_max;
                  return (
                    <div key={platform} className="rounded-xl border bg-muted/30 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform={platform} size="sm" />
                          <span className="text-xs font-medium">{platformLabel(platform)}</span>
                        </div>
                        {spec && (
                          <span className={`text-[10px] ${overTitle ? 'font-semibold text-rose-600' : 'text-muted-foreground'}`}>
                            标题 {currentTitle.length}/{spec.title_max}
                          </span>
                        )}
                      </div>
                      <Input
                        value={value.title ?? ''}
                        onChange={(event) => setPerPlatform({
                          ...perPlatform,
                          [platform]: { ...value, title: event.target.value },
                        })}
                        placeholder="留空使用通用标题"
                        className="mb-2 h-9 text-xs"
                      />
                      <Input
                        value={value.tags ?? ''}
                        onChange={(event) => setPerPlatform({
                          ...perPlatform,
                          [platform]: { ...value, tags: event.target.value },
                        })}
                        placeholder="留空使用通用话题"
                        className="h-9 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* 提交 */}
      <div className="fixed left-0 right-0 bottom-0 bg-background/95 backdrop-blur border-t px-4 py-3 z-30">
        <Button
          className="w-full h-12 bg-primary text-primary-foreground text-base"
          onClick={submit}
          disabled={submitting || selectedAccounts.length === 0 || !title.trim()}
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          {scheduleAt ? `定时发布到 ${selectedAccounts.length} 个账号` : `确认发布到 ${selectedAccounts.length} 个账号`}
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
