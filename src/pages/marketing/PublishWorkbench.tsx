// 一键发布工作台:挑账号、写标题/正文/标签,提交后展示进度
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveShop } from '@/hooks/useShops';
import { AuthPage } from '@/components/auth/AuthPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, ShieldCheck, ShieldAlert, ShieldOff, CheckCircle2,
  AlertCircle, Send, Plus, X, ArrowLeft, ExternalLink,
} from 'lucide-react';

const PLATFORM_LABEL: Record<string, string> = {
  douyin: '抖音', xhs: '小红书', wechat_video: '视频号', kuaishou: '快手',
};

interface Account {
  id: string; platform: string; account_name: string | null;
  avatar_url: string | null; cookie_status: string; worker_account_id: number | null;
}
interface Target {
  id: string; account_id: string; platform: string; status: string;
  error_message: string | null; finished_at: string | null;
  social_accounts?: { account_name: string | null; avatar_url: string | null; platform: string };
}

export default function PublishWorkbench() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { shopId, loading: shopLoading } = useEffectiveShop();

  const [asset, setAsset] = useState<any>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [jobStatus, setJobStatus] = useState<string>('');

  useEffect(() => {
    if (!assetId || !shopId) return;
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: accs }] = await Promise.all([
        supabase.from('marketing_assets').select('*').eq('id', assetId).maybeSingle(),
        supabase.functions.invoke('social-account-list', { body: { shop_id: shopId } }),
      ]);
      setAsset(a);
      const list = (accs as any)?.data?.accounts || (accs as any)?.accounts || [];
      setAccounts(list);
      if (a) {
        // 复用上次生成的小红书爆文标题
        const c = a.meta?.video_copy;
        if (c?.title) setTitle(String(c.title).slice(0, 50));
        if (c?.body) setDesc(String(c.body));
        if (Array.isArray(c?.hashtags)) {
          setTags(c.hashtags.map((s: string) => String(s).replace(/^#/, '').trim()).filter(Boolean).slice(0, 10));
        } else if (Array.isArray(a.tags)) {
          setTags(a.tags.slice(0, 10));
        }
      }
      setLoading(false);
    })();
  }, [assetId, shopId]);

  const togglePick = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };
  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags([...tags, t].slice(0, 10));
    setTagInput('');
  };

  const submit = async () => {
    if (!title.trim()) { toast.error('请填标题'); return; }
    if (picked.size === 0) { toast.error('请至少选一个账号'); return; }
    const invalid = accounts.filter(a => picked.has(a.id) && a.cookie_status !== 'active');
    if (invalid.length > 0) {
      if (!confirm(`有 ${invalid.length} 个账号不在线,继续发布可能失败。仍要继续？`)) return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('social-publish-create', {
        body: {
          asset_id: assetId,
          account_ids: Array.from(picked),
          title: title.trim(),
          description: desc.trim(),
          tags,
        },
      });
      if (error) throw error;
      const newJobId = (data as any)?.job_id;
      const errors = (data as any)?.errors || [];
      if (errors.length > 0) toast.warning(`部分账号未成功: ${errors.join(' / ')}`);
      else toast.success('已提交,请到平台后台查看');
      setJobId(newJobId);
    } catch (e: any) {
      toast.error('提交失败: ' + (e?.message || e));
    } finally { setSubmitting(false); }
  };

  // 轮询进度
  const pollStatus = useCallback(async () => {
    if (!jobId) return;
    const { data, error } = await supabase.functions.invoke('social-publish-status', {
      body: {}, // 用 query string
      method: 'GET' as any,
    } as any);
    // 上面 invoke 不支持 GET query, 手工 fetch
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/social-publish-status?job_id=${jobId}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } },
        );
        const j = await r.json();
        if (stop) return;
        setTargets(j.targets || []);
        setJobStatus(j.job?.status || '');
      } catch { /* ignore */ }
    };
    void tick();
    const iv = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(iv); };
  }, [jobId]);

  if (authLoading || shopLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="一键发布" back={`/me/marketing/library`} subtitle="把视频投给多个平台账号" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 pb-24 space-y-4">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !asset || asset.kind !== 'video' || !asset.output_url ? (
          <div className="text-center py-20 text-sm text-muted-foreground">
            视频还没生成完毕,先回素材库等渲染完成
            <div className="mt-3"><Button variant="outline" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-3.5 h-3.5 mr-1" />返回</Button></div>
          </div>
        ) : jobId ? (
          <PublishProgress targets={targets} jobStatus={jobStatus} onBack={() => { setJobId(null); setPicked(new Set()); }} />
        ) : (
          <>
            <div className="flex gap-3 bg-card border border-border rounded-lg p-3">
              <video src={asset.output_url} poster={asset.meta?.poster_url || asset.meta?.cover_url}
                className="w-24 h-32 rounded bg-black object-cover" muted preload="metadata" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">将发布以下视频</p>
                <p className="text-sm font-semibold truncate">{asset.meta?.topic || '未命名视频'}</p>
                <p className="text-[11px] text-muted-foreground mt-1">时长 {asset.meta?.duration || '?'}s · {asset.meta?.aspect || '9:16'}</p>
              </div>
            </div>

            <div>
              <Label>选择账号 ({picked.size}/{accounts.length})</Label>
              {accounts.length === 0 ? (
                <div className="mt-2 border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
                  还没绑定账号
                  <div className="mt-2"><Button size="sm" variant="outline" onClick={() => navigate('/me/marketing/social-accounts')}>去绑定</Button></div>
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {accounts.map(a => {
                    const on = picked.has(a.id);
                    return (
                      <button key={a.id} type="button" onClick={() => togglePick(a.id)}
                        className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                          on ? 'border-accent bg-accent/10' : 'border-border bg-card'
                        }`}>
                        <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">
                          {a.avatar_url ? <img src={a.avatar_url} alt="" className="w-full h-full object-cover" /> : (a.account_name || '?').slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{a.account_name || '未命名'}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-muted">{PLATFORM_LABEL[a.platform]}</span>
                            <StatusBadge s={a.cookie_status} />
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 ${on ? 'bg-accent border-accent' : 'border-muted-foreground/30'} flex items-center justify-center`}>
                          {on && <CheckCircle2 className="w-3.5 h-3.5 text-accent-foreground" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="title">标题 *</Label>
              <Input id="title" value={title} onChange={e => setTitle(e.target.value.slice(0, 50))} placeholder="抓眼球的标题" maxLength={50} />
              <p className="text-[10px] text-muted-foreground mt-1">{title.length}/50</p>
            </div>

            <div>
              <Label htmlFor="desc">正文 / 描述</Label>
              <Textarea id="desc" value={desc} onChange={e => setDesc(e.target.value.slice(0, 1000))} rows={4} placeholder="详细介绍商品、卖点、亮点……" />
            </div>

            <div>
              <Label>话题标签</Label>
              <div className="flex gap-2 mt-1">
                <Input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="输入后按 +"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
                <Button type="button" variant="outline" size="icon" onClick={addTag}><Plus className="w-4 h-4" /></Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[11px]">
                      #{t}
                      <button onClick={() => setTags(tags.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-muted/40 border border-border rounded-lg p-2.5">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                ⚠️ 本工具通过模拟登录代发布:提交成功仅代表已交付给平台后台,不等于审核通过。同号短时高频发布可能触发平台风控。
              </p>
            </div>

            <Button className="w-full h-12 text-base" onClick={submit} disabled={submitting || picked.size === 0 || !title.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              提交发布 ({picked.size})
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function StatusBadge({ s }: { s: string }) {
  if (s === 'active') return <span className="text-green-600 inline-flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" />在线</span>;
  if (s === 'expired') return <span className="text-amber-600 inline-flex items-center gap-0.5"><ShieldAlert className="w-3 h-3" />已过期</span>;
  return <span className="text-destructive inline-flex items-center gap-0.5"><ShieldOff className="w-3 h-3" />失效</span>;
}

function PublishProgress({ targets, jobStatus, onBack }: { targets: Target[]; jobStatus: string; onBack: () => void }) {
  const done = targets.filter(t => t.status === 'success').length;
  const fail = targets.filter(t => t.status === 'failed').length;
  const pending = targets.filter(t => !['success', 'failed', 'cancelled'].includes(t.status)).length;

  return (
    <div className="space-y-4">
      <div className="text-center py-6 bg-card border border-border rounded-lg">
        <p className="text-3xl font-bold">{done} <span className="text-base text-muted-foreground">/ {targets.length}</span></p>
        <p className="text-sm text-muted-foreground mt-1">
          {jobStatus === 'done' ? '✅ 全部已提交' : jobStatus === 'partial' ? `⚠️ 部分成功 · ${fail} 失败` : jobStatus === 'failed' ? '❌ 全部失败' : `提交中 · ${pending} 个待回执`}
        </p>
      </div>

      <div className="space-y-1.5">
        {targets.map(t => (
          <div key={t.id} className="flex items-center gap-3 bg-card border border-border rounded-lg p-2.5">
            <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">
              {t.social_accounts?.avatar_url
                ? <img src={t.social_accounts.avatar_url} alt="" className="w-full h-full object-cover" />
                : (t.social_accounts?.account_name || '?').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{t.social_accounts?.account_name || '账号'}</div>
              <div className="text-[11px] text-muted-foreground">{PLATFORM_LABEL[t.platform]}</div>
              {t.error_message && <div className="text-[11px] text-destructive truncate" title={t.error_message}>{t.error_message}</div>}
            </div>
            {t.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
            {t.status === 'failed' && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
            {['queued', 'running'].includes(t.status) && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>

      <div className="bg-muted/40 rounded-lg p-3 text-[11px] text-muted-foreground leading-relaxed">
        worker 在浏览器里走的是模拟点击,**"已提交"不等于"已发布成功"**。请到对应平台 APP / 后台确认稿件是否真的进了草稿箱或已审通过。
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>再发一次</Button>
        <Button className="flex-1" onClick={() => window.open('https://creator.douyin.com/', '_blank')}>
          <ExternalLink className="w-3.5 h-3.5 mr-1" />打开抖音后台
        </Button>
      </div>
    </div>
  );
}
