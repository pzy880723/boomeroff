import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowRight, FolderOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UploadGrid } from './UploadGrid';
import { AspectPicker } from './AspectPicker';
import { StepBar } from './StepBar';
import { toast } from 'sonner';
import { VideoBriefChat, type BriefMsg } from '@/components/marketing/VideoBriefChat';
import { ShopPicker } from '@/components/marketing/ShopPicker';
import { LibraryImagePickerDialog } from '@/components/marketing/LibraryImagePickerDialog';
import { CharacterPicker, type Character } from '@/components/marketing/CharacterPicker';
import { useEffectiveShop } from '@/hooks/useShops';

const VIDEO_TYPES = [
  { v: 'store_tour', label: '探店' },
  { v: 'product_showcase', label: '产品展示' },
  { v: 'store_ambience', label: '店铺氛围' },
  { v: 'new_arrival', label: '新品上架' },
] as const;
type VType = typeof VIDEO_TYPES[number]['v'];

const STYLES = [
  { v: 'steady', label: '稳重' },
  { v: 'lively', label: '活泼' },
  { v: 'energetic', label: '激动' },
  { v: 'elegant', label: '优雅' },
  { v: 'nostalgic', label: '怀旧' },
  { v: 'playful', label: '俏皮' },
] as const;
type SType = typeof STYLES[number]['v'];

const DURATIONS = [15, 20, 30] as const;
const ASPECTS = ['9:16', '1:1', '16:9'] as const;

export default function MarketingVideo() {
  const loc = useLocation();
  const { shopId, setShopId, isAdmin } = useEffectiveShop();
  const [urls, setUrls] = useState<string[]>((loc.state as any)?.image_urls || []);
  const [vtype, setVtype] = useState<VType>('store_tour');
  const [style, setStyle] = useState<SType>('steady');
  const [duration, setDuration] = useState<15 | 20 | 30>(15);
  const [aspect, setAspect] = useState<typeof ASPECTS[number]>('9:16');
  const [highlight, setHighlight] = useState('');
  const [brief, setBrief] = useState<BriefMsg[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [imageDescriptions, setImageDescriptions] = useState<{ index: number; summary: string; best_for?: string; tags?: string[] }[]>([]);
  const [descLoading, setDescLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<any>(null);
  const [rendering, setRendering] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => { setScript(null); setJobId(null); setCharacter(null); }, [shopId]);

  // 上传/移除参考图后,后台让 AI 看一遍,产出每张图的简短描述,给 BriefChat 和分镜共用
  useEffect(() => {
    if (!urls.length) { setImageDescriptions([]); return; }
    const handle = setTimeout(async () => {
      setDescLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('describe-marketing-images', {
          body: { image_urls: urls },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setImageDescriptions(((data as any)?.descriptions || []) as any);
      } catch (e: any) {
        console.warn('[describe-images] failed', e);
      } finally { setDescLoading(false); }
    }, 800);
    return () => clearTimeout(handle);
  }, [urls.join('|')]);

  const userTurns = brief.filter((m) => m.role === 'user').length;
  // 取对话里最近一条 draft_script 作为已确认脚本
  const approvedScript = [...brief].reverse().find((m) => m.role === 'assistant' && (m as any).kind === 'draft_script')?.content || '';

  const briefTranscript = brief
    .map((m) => `${m.role === 'user' ? '店员' : '助理'}：${m.content}`)
    .join('\n');

  const topic = brief.find((m) => m.role === 'user')?.content.slice(0, 200) || '';

  const genScript = async () => {
    if (!shopId) return toast.error('请先选择店铺');
    if (userTurns < 1) return toast.error('先和 AI 聊一句你想拍什么');
    setGenerating(true); setScript(null);
    try {
      const charPayload = character ? {
        id: character.id, name: character.name, role_label: character.role_label,
        visual_signature: character.visual_signature, core_emotion: character.core_emotion,
        cover_url: character.cover_url,
      } : null;
      const { data, error } = await supabase.functions.invoke('generate-marketing-video-script', {
        body: {
          shop_id: shopId,
          image_urls: urls,
          video_type: vtype,
          duration,
          aspect,
          topic,
          highlight,
          style,
          brief_transcript: briefTranscript,
          approved_script: approvedScript,
          image_descriptions: imageDescriptions,
          character: charPayload,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setScript((data as any).script);
    } catch (e: any) { toast.error(e?.message || '脚本生成失败'); }
    finally { setGenerating(false); }
  };

  const confirmRender = async () => {
    if (!script) return;
    if (!shopId) return toast.error('请先选择店铺');
    setRendering(true);
    try {
      let finalScript = script;
      // 多段视频且未选角色 → 尝试生成兜底角色身份板;失败不阻塞渲染
      if (duration > 12 && !character && !script.character) {
        toast.message('为保证角色不变脸,正在生成兜底主角…', { duration: 4000 });
        try {
          const anc = await supabase.functions.invoke('ensure-auto-anchor-character', {
            body: { shop_id: shopId, video_type: vtype, style, brief_summary: briefTranscript.slice(0, 600) },
          });
          if (anc.error) throw anc.error;
          if ((anc.data as any)?.error) throw new Error((anc.data as any).error);
          const anchorChar = (anc.data as any)?.character;
          if (anchorChar) {
            finalScript = { ...script, character: {
              id: anchorChar.id, name: anchorChar.name, role_label: anchorChar.role_label,
              visual_signature: anchorChar.visual_signature, core_emotion: anchorChar.core_emotion,
              cover_url: anchorChar.cover_url,
            } };
          }
        } catch (ancErr: any) {
          console.warn('[auto-anchor] failed, continue without', ancErr);
          toast.message('兜底主角生成失败,跳过,继续提交渲染', { duration: 3000 });
        }
      }
      const { data, error } = await supabase.functions.invoke('render-marketing-video', {
        body: { script: { ...finalScript, video_type: vtype }, style, shop_id: shopId },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.ok === false) throw new Error(resp.error || '渲染提交失败');
      if (resp?.error) throw new Error(resp.error);
      setJobId(resp.job_id);
      toast.success('已确认脚本，渲染任务已入队');
    } catch (e: any) {
      const msg = e?.message || e?.error?.message || '提交失败,请稍后重试';
      toast.error(msg);
    }
    finally { setRendering(false); }
  };

  const updateScene = (key: 'hook' | 'outro', field: string, val: any) => {
    setScript({ ...script, [key]: { ...script[key], [field]: val } });
  };
  const updateMid = (i: number, field: string, val: any) => {
    const scenes = [...script.scenes];
    scenes[i] = { ...scenes[i], [field]: val };
    setScript({ ...script, scenes });
  };

  return (
    <>
      <PageHeader title="AI 视频" back="/me/marketing" subtitle="营销中心 / 文生视频" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">
        <StepBar
          steps={['选店铺', '参考图/主角', '立意沟通', '确认分镜', '渲染']}
          current={!shopId ? 0 : userTurns < 1 ? 1 : !script ? 2 : !jobId ? 3 : 4}
        />

        <ShopPicker value={shopId} onChange={setShopId} locked={!isAdmin} />

        {!shopId ? (
          <p className="text-center text-[12px] text-muted-foreground py-8">请先选择店铺，再开始创作。</p>
        ) : (<>
        {/* 视频参数 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-5">
          <SectionLabel num="01">视频类型</SectionLabel>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {VIDEO_TYPES.map((t) => (
              <Chip key={t.v} active={vtype === t.v} onClick={() => { setVtype(t.v); setScript(null); }}>{t.label}</Chip>
            ))}
          </div>

          <SectionLabel num="02">视频风格</SectionLabel>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <Chip key={s.v} active={style === s.v} onClick={() => { setStyle(s.v); setScript(null); }}>{s.label}</Chip>
            ))}
          </div>

          <SectionLabel num="03">时长</SectionLabel>
          <div className="-mt-2 flex gap-1.5">
            {DURATIONS.map((d) => (
              <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d} 秒</Chip>
            ))}
          </div>
          {duration > 12 && (
            <p className="-mt-1 text-[10px] text-muted-foreground leading-relaxed pl-1">
              · 超过 12 秒的视频会自动拆成 {Math.ceil(duration / 10)} 段生成,完成后在素材库里自动拼接成一支 MP4。整体约需 {Math.ceil(duration / 10) * 2}-{Math.ceil(duration / 10) * 3} 分钟。
            </p>
          )}

          <SectionLabel num="04">画幅</SectionLabel>
          <div className="-mt-2">
            <AspectPicker value={aspect} onChange={(v) => setAspect(v as typeof ASPECTS[number])} />
          </div>

          <div className="pt-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">想突出的点</p>
            <Input
              placeholder="可选 · 80 字以内"
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              maxLength={80}
              className="bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 text-sm h-9"
            />
          </div>
        </section>

        {/* 参考图(可选) */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel num="05">参考图(可选,最多 20 张)</SectionLabel>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPickerOpen(true)}>
              <FolderOpen className="w-3.5 h-3.5" />从素材库导入
            </Button>
          </div>
          <UploadGrid urls={urls} onChange={(next) => { setUrls(next); setScript(null); }} max={20} preset="thumb" title="" />
          <p className="text-[10px] text-muted-foreground">不上传也能生成。AI 会按场景从这些图里挑最贴合的一张。</p>
        </section>

        {/* 主角(可选) */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-3">
          <SectionLabel num="06">主角(可选)</SectionLabel>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            选一个固定主角,所有镜头都用 TA,跨段不变脸。{duration > 12 && '多段视频如果不选,系统会自动先生成一张兜底角色身份板。'}
          </p>
          <CharacterPicker shopId={shopId} value={character} onChange={(c) => { setCharacter(c); setScript(null); }} />
        </section>

        {/* 立意沟通 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel num="07">立意沟通</SectionLabel>
            <Button size="sm" onClick={genScript} disabled={generating || userTurns < 1} className="h-7 text-[11px]">
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              生成分镜
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            先和 AI 助理简单聊几句,把要拍的东西、想要的感觉说清楚。聊够了再点右上「生成分镜」。
          </p>
          <VideoBriefChat
            context={{ video_type: vtype, duration, aspect, style }}
            messages={brief}
            onChange={(m) => { setBrief(m); setScript(null); }}
          />
        </section>

        {/* 分镜确认 */}
        {script && (
          <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-4 animate-card-enter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display text-[11px] text-accent tracking-[0.18em]">脚本</span>
                <span className="w-1 h-1 rounded-full bg-accent" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">文生视频 · 逐镜确认</span>
              </div>
              <Button size="sm" variant="ghost" onClick={genScript} disabled={generating}>
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}重新生成
              </Button>
            </div>

            <SceneRow title="钩子" num="00" scene={script.hook} urls={urls}
              onField={(f, v) => updateScene('hook', f, v)}
              onImg={(v) => updateScene('hook', 'image_index', v)} />
            {script.scenes.map((sc: any, i: number) => (
              <SceneRow key={i} title="镜头" num={String(i + 1).padStart(2, '0')} scene={sc} urls={urls}
                onField={(f, v) => updateMid(i, f, v)}
                onImg={(v) => updateMid(i, 'image_index', v)} />
            ))}
            <SceneRow title="收尾" num="99" scene={script.outro} urls={urls}
              onField={(f, v) => updateScene('outro', f, v)}
              onImg={(v) => updateScene('outro', 'image_index', v)} />

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-center gap-3 flex-wrap">
              <span>BGM · {script.bgm}</span>
              <span className="opacity-50">·</span>
              <span>总时长 {script.total_duration_s}s</span>
              <span className="opacity-50">·</span>
              <span>{script.aspect}</span>
              <span className="opacity-50">·</span>
              <span className="text-accent">{script.style_label || '稳重'} · 文生视频</span>
            </div>

            {!jobId ? (
              <Button onClick={confirmRender} disabled={rendering} className="w-full h-11">
                {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                确认脚本，开始渲染
              </Button>
            ) : (
              <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-xs space-y-2">
                <p className="font-medium text-foreground">渲染任务已入队 · ID {jobId.slice(0, 8)}</p>
                <p className="text-muted-foreground">视频会在后台合成，完成后出现在素材库。</p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to="/me/marketing/library">
                    去素材库查看进度 <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </section>
        )}
        </>)}
      </div>

      <LibraryImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        shopId={shopId}
        max={20 - urls.length}
        onConfirm={(picked) => { setUrls([...urls, ...picked].slice(0, 20)); setScript(null); }}
      />
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

function SceneRow({
  title, num, scene, urls, onField, onImg,
}: {
  title: string; num: string; scene: any; urls: string[];
  onField: (field: 'scene' | 'action' | 'dialogue' | 'subtitle' | 'motion', v: string) => void;
  onImg: (v: number | null) => void;
}) {
  const refImg = scene.image_index !== null && scene.image_index !== undefined && urls[scene.image_index];
  // 兼容旧字段
  const sceneText = scene.scene ?? scene.video_prompt ?? '';
  const subtitle = scene.subtitle ?? scene.text ?? '';
  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-[11px] text-accent tracking-[0.18em]">{num}</span>
          <span className="text-[11px] font-semibold text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{scene.duration_s}s</span>
          <span className="opacity-50">·</span>
          <Input
            value={scene.motion || ''}
            onChange={(e) => onField('motion', e.target.value)}
            placeholder="运镜"
            maxLength={16}
            className="h-6 w-20 text-[10px] px-1.5 bg-transparent"
          />
        </div>
      </div>
      <div className="flex gap-3">
        {refImg ? (
          <img src={refImg} alt="" className="w-16 h-16 object-cover rounded border border-accent/15 flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded border border-dashed border-border bg-card flex items-center justify-center text-[9px] text-muted-foreground text-center px-1 leading-tight flex-shrink-0">无参考图</div>
        )}
        <div className="flex-1 space-y-2 min-w-0">
          <FieldBlock label="场景">
            <Textarea
              value={sceneText}
              onChange={(e) => onField('scene', e.target.value)}
              placeholder="地点 / 光线 / 道具 / 景别 / 构图"
              rows={2}
              maxLength={200}
              className="text-[11px] leading-snug resize-none bg-card"
            />
          </FieldBlock>
          <FieldBlock label="动作">
            <Textarea
              value={scene.action || ''}
              onChange={(e) => onField('action', e.target.value)}
              placeholder="人物动作 / 镜头运动"
              rows={2}
              maxLength={120}
              className="text-[11px] leading-snug resize-none bg-card"
            />
          </FieldBlock>
          <FieldBlock label="台词">
            <Textarea
              value={scene.dialogue || ''}
              onChange={(e) => onField('dialogue', e.target.value)}
              placeholder="人物说的话 / 画外音(可空)"
              rows={1}
              maxLength={60}
              className="text-[11px] leading-snug resize-none bg-card"
            />
          </FieldBlock>
          <FieldBlock label="字幕">
            <Input
              value={subtitle}
              onChange={(e) => onField('subtitle', e.target.value)}
              placeholder="≤14 字"
              maxLength={14}
              className="bg-card h-8 text-sm"
            />
          </FieldBlock>
          {urls.length > 0 && (
            <div className="flex gap-1 flex-wrap pt-1">
              <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground self-center mr-1">参考图</span>
              <button
                onClick={() => onImg(null)}
                className={[
                  'text-[10px] px-1.5 h-5 rounded border transition-colors',
                  scene.image_index === null || scene.image_index === undefined
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-accent/50',
                ].join(' ')}
              >无</button>
              {urls.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onImg(i)}
                  className={[
                    'text-[10px] px-1.5 h-5 rounded border transition-colors',
                    scene.image_index === i
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-accent/50',
                  ].join(' ')}
                >
                  #{i}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-[0.18em] text-accent/80 font-semibold">{label}</div>
      {children}
    </div>
  );
}
