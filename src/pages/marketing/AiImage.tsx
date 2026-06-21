import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Send, Paperclip, X, Download, FileText, Video, Sparkles, ImagePlus, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ShopPicker } from '@/components/marketing/ShopPicker';
import { useEffectiveShop } from '@/hooks/useShops';
import { uploadMarketingImages } from './uploadMarketingImages';
import { LibraryImagePickerDialog } from '@/components/marketing/LibraryImagePickerDialog';
import { TEMPLATE_GROUPS, findTemplate, type AiImageTemplate } from './aiImageTemplates';
import boomerIdle from '@/assets/boomer/boomer-idle.png';

type Aspect = '1:1' | '3:4' | '9:16' | '16:9';
const ASPECTS: Aspect[] = ['1:1', '3:4', '9:16', '16:9'];

type Msg =
  | { id: string; role: 'user'; text: string; refs: string[]; aspect: Aspect; templateName?: string }
  | { id: string; role: 'ai'; status: 'loading' | 'done' | 'error'; outputUrl?: string; error?: string };

const uid = () => Math.random().toString(36).slice(2);

export default function AiImage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { shopId, setShopId, isAdmin } = useEffectiveShop();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [refs, setRefs] = useState<string[]>([]); // 当前已挂的参考图 url
  const [aspect, setAspect] = useState<Aspect>('1:1');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [tplFieldsTemplate, setTplFieldsTemplate] = useState<AiImageTemplate | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<{ id: string; fields: Record<string, string>; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚到底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ===== 附图相关 =====
  const removeRef = (url: string) => {
    setRefs((cur) => cur.filter((u) => u !== url));
    // 也清掉输入框里相应的 @imgN
    const idx = refs.indexOf(url);
    if (idx >= 0) {
      const tag = `@img${idx + 1}`;
      setInput((s) => s.replace(new RegExp(`\\s*${tag}`, 'g'), '').replace(/\s+/g, ' ').trim());
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    const arr = Array.from(files).slice(0, 4 - refs.length);
    if (!arr.length) { toast.error('最多挂 4 张参考图'); return; }
    setUploading(true);
    try {
      const urls = await uploadMarketingImages(user.id, arr, { preset: 'thumb' });
      const ok = urls.filter((u): u is string => !!u);
      setRefs((cur) => [...cur, ...ok].slice(0, 4));
    } catch (e: any) {
      toast.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onLibraryConfirm = (urls: string[]) => {
    setRefs((cur) => [...cur, ...urls].slice(0, 4));
  };

  const insertMention = (idx: number) => {
    const tag = `@img${idx + 1}`;
    const ta = textareaRef.current;
    if (ta && typeof ta.selectionStart === 'number') {
      const start = ta.selectionStart;
      const end = ta.selectionEnd ?? start;
      // 若光标紧跟一个未完成的 '@',替换它;否则插入
      const before = input.slice(0, start);
      const after = input.slice(end);
      const atIdx = before.lastIndexOf('@');
      const replaceFromAt = atIdx >= 0 && /^@\w*$/.test(before.slice(atIdx));
      const left = replaceFromAt ? before.slice(0, atIdx) : before;
      const insert = `${left && !left.endsWith(' ') ? ' ' : ''}${tag} `;
      const next = left + insert + after;
      setInput(next);
      const caret = (left + insert).length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(caret, caret);
      });
    } else {
      setInput((s) => (s ? `${s.trimEnd()} ${tag} ` : `${tag} `));
      textareaRef.current?.focus();
    }
    setMentionOpen(false);
  };

  // ===== @ 提及解析 =====
  const mentionedIdxs = (() => {
    const seen = new Set<number>();
    const out: number[] = [];
    const re = /@img(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const i = parseInt(m[1], 10) - 1;
      if (i >= 0 && i < refs.length && !seen.has(i)) {
        seen.add(i);
        out.push(i);
      }
    }
    return out;
  })();

  const removeMention = (idx: number) => {
    const tag = `@img${idx + 1}`;
    setInput((s) => s.replace(new RegExp(`\\s*${tag}\\s?`, 'g'), ' ').replace(/\s{2,}/g, ' ').trimStart());
  };

  const [mentionOpen, setMentionOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  // ===== 模板 =====
  const onPickTemplate = (t: AiImageTemplate) => {
    setTemplateOpen(false);
    setTplFieldsTemplate(t);
    setAspect(t.defaultAspect);
  };

  const onConfirmTemplateFields = (fields: Record<string, string>) => {
    if (!tplFieldsTemplate) return;
    setPendingTemplate({ id: tplFieldsTemplate.id, fields, name: tplFieldsTemplate.name });
    setInput((s) => s || `按"${tplFieldsTemplate.name}"模板做一张图`);
    setTplFieldsTemplate(null);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  // ===== 发送 =====
  const send = async () => {
    if (!shopId) { toast.error('请先选择店铺'); return; }
    if (!input.trim() && !pendingTemplate) { toast.error('说说想要什么画面?'); return; }
    if (busy) return;

    const userMsgId = uid();
    const aiMsgId = uid();
    const snapshot = {
      text: input.trim(),
      refs: [...refs],
      aspect,
      template: pendingTemplate,
    };

    setMessages((cur) => [
      ...cur,
      { id: userMsgId, role: 'user', text: snapshot.text, refs: snapshot.refs, aspect: snapshot.aspect, templateName: snapshot.template?.name },
      { id: aiMsgId, role: 'ai', status: 'loading' },
    ]);
    setInput('');
    setPendingTemplate(null);
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-image-chat', {
        body: {
          shop_id: shopId,
          prompt: snapshot.text,
          aspect: snapshot.aspect,
          refs: snapshot.refs,
          template_id: snapshot.template?.id,
          template_fields: snapshot.template?.fields,
        },
      });
      if (error) throw error;
      if (!data?.ok) {
        setMessages((cur) => cur.map((m) => m.id === aiMsgId && m.role === 'ai' ? { ...m, status: 'error', error: data?.error || '生成失败' } : m));
      } else {
        setMessages((cur) => cur.map((m) => m.id === aiMsgId && m.role === 'ai' ? { ...m, status: 'done', outputUrl: data.output_url } : m));
      }
    } catch (e: any) {
      setMessages((cur) => cur.map((m) => m.id === aiMsgId && m.role === 'ai' ? { ...m, status: 'error', error: e?.message || '生成失败' } : m));
    } finally {
      setBusy(false);
    }
  };

  // ===== 渲染 =====
  return (
    <>
      <PageHeader title="AI 图片" back="/me/marketing" subtitle="营销中心 / 对话出图" />

      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        {/* 顶部:店铺选择 */}
        <div className="container mx-auto max-w-screen-md w-full px-4 pt-3 pb-2 shrink-0">
          <ShopPicker value={shopId} onChange={setShopId} locked={!isAdmin} />
        </div>

        {/* 对话流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="container mx-auto max-w-screen-md w-full space-y-4">
            {messages.length === 0 && (
              <EmptyState />
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} msg={m} />
              ) : (
                <AiBubble key={m.id} msg={m} onCopy={(url) => nav('/me/marketing/copy', { state: { image_urls: [url] } })} onVideo={(url) => nav('/me/marketing/video', { state: { image_urls: [url] } })} />
              )
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-border bg-card shrink-0">
          <div className="container mx-auto max-w-screen-md w-full px-4 py-3 space-y-2">
            {/* 模板/比例 行 */}
            <div className="flex items-center gap-2 flex-wrap">
              <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-[12px] gap-1">
                    <LayoutGrid className="w-3.5 h-3.5" />
                    模板
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-3" align="start">
                  <TemplatePickerInline onPick={onPickTemplate} />
                </PopoverContent>
              </Popover>

              {pendingTemplate && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30 flex items-center gap-1">
                  模板:{pendingTemplate.name}
                  <button onClick={() => setPendingTemplate(null)}><X className="w-3 h-3" /></button>
                </span>
              )}

              <div className="ml-auto flex gap-1">
                {ASPECTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className={[
                      'flex flex-col items-center justify-center gap-0.5 px-1.5 h-11 min-w-[40px] rounded-md border transition-colors',
                      aspect === a ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-accent/50',
                    ].join(' ')}
                    aria-label={`比例 ${a}`}
                  >
                    <AspectIcon ratio={a} active={aspect === a} />
                    <span className="text-[10px] leading-none">{a}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 附图条 */}
            {(refs.length > 0 || uploading) && (
              <div className="flex gap-2 items-center overflow-x-auto py-1">
                {refs.map((url, i) => (
                  <div key={url} className="relative shrink-0 group">
                    <img src={url} alt="" className="w-14 h-14 rounded object-cover border border-border" />
                    <button
                      onClick={() => insertMention(i)}
                      className="absolute -bottom-1 -left-1 text-[10px] bg-primary text-primary-foreground rounded px-1 leading-tight"
                    >@{i + 1}</button>
                    <button
                      onClick={() => removeRef(url)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center"
                    ><X className="w-2.5 h-2.5" /></button>
                  </div>
                ))}
                {uploading && (
                  <div className="w-14 h-14 rounded border border-dashed border-border flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  </div>
                )}
              </div>
            )}

            {/* 输入框 + 发送 */}
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => fileInputRef.current?.click()} disabled={refs.length >= 4}>
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setPickerOpen(true)} disabled={refs.length >= 4}>
                  <ImagePlus className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={refs.length === 0 ? '描述你想要的画面…(回车发送)' : '怎么改这些参考图?可用 @1 @2 指定哪一张'}
                rows={2}
                className="resize-none flex-1 min-h-[60px]"
              />
              <Button onClick={send} disabled={busy || (!input.trim() && !pendingTemplate)} size="icon" className="h-9 w-9">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">最多挂 4 张参考图 · 每日 50 张额度 · 历史不保存,出图自动进素材库</p>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />

      <LibraryImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        shopId={shopId}
        max={4 - refs.length}
        onConfirm={onLibraryConfirm}
      />

      {/* 模板字段表单 */}
      <Dialog open={!!tplFieldsTemplate} onOpenChange={(v) => !v && setTplFieldsTemplate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{tplFieldsTemplate?.name}</DialogTitle>
          </DialogHeader>
          {tplFieldsTemplate && (
            <TemplateFieldsForm
              template={tplFieldsTemplate}
              onSubmit={onConfirmTemplateFields}
              onCancel={() => setTplFieldsTemplate(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== 子组件 =====

function EmptyState() {
  return (
    <div className="pt-10 flex flex-col items-center text-center">
      <img src={boomerIdle} alt="" className="w-20 h-20 object-contain opacity-90" draggable={false} />
      <h3 className="font-display text-lg mt-3">和 BOOMER 聊出一张图</h3>
      <p className="text-[12px] text-muted-foreground mt-2 max-w-[280px] leading-relaxed">
        告诉它你想要什么 —— 文生图、改图、多图融合都行。<br />
        懒得想?点左下角"模板"挑一个直接发。
      </p>
      <div className="mt-5 grid grid-cols-1 gap-2 max-w-[300px] w-full text-left">
        <Tip icon={<Sparkles className="w-3.5 h-3.5" />} title="文生图" desc='"一只手捧着米色复古马克杯,木质桌面,自然光"' />
        <Tip icon={<ImagePlus className="w-3.5 h-3.5" />} title="图生图" desc="挂 1 张图 + '换成黄昏暖光'" />
        <Tip icon={<LayoutGrid className="w-3.5 h-3.5" />} title="多图融合" desc="挂 2-4 张,用 @1 @2 指代" />
      </div>
    </div>
  );
}

function Tip({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 flex gap-2">
      <div className="w-6 h-6 rounded bg-accent/10 text-accent flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
      </div>
    </div>
  );
}

function UserBubble({ msg }: { msg: Extract<Msg, { role: 'user' }> }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2.5 space-y-2">
        {msg.refs.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {msg.refs.map((u, i) => (
              <div key={u} className="relative">
                <img src={u} alt="" className="w-12 h-12 rounded object-cover" />
                <span className="absolute -bottom-1 -left-1 text-[9px] bg-background/80 text-foreground rounded px-1 leading-tight">@{i + 1}</span>
              </div>
            ))}
          </div>
        )}
        {msg.templateName && (
          <div className="text-[10px] opacity-80">模板 · {msg.templateName}</div>
        )}
        {msg.text && <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{msg.text}</p>}
        <div className="text-[10px] opacity-70 text-right">{msg.aspect}</div>
      </div>
    </div>
  );
}

function AiBubble({ msg, onCopy, onVideo }: { msg: Extract<Msg, { role: 'ai' }>; onCopy: (u: string) => void; onVideo: (u: string) => void }) {
  return (
    <div className="flex gap-2 items-start">
      <img src={boomerIdle} alt="" className="w-7 h-7 object-contain shrink-0" draggable={false} />
      <div className="flex-1 max-w-[85%]">
        {msg.status === 'loading' && (
          <div className="bg-muted/40 rounded-2xl rounded-tl-sm px-3.5 py-3 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span className="text-[12px] text-muted-foreground">BOOMER 正在画…通常 10-20 秒</span>
          </div>
        )}
        {msg.status === 'error' && (
          <div className="bg-destructive/10 text-destructive rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[12px]">
            {msg.error}
          </div>
        )}
        {msg.status === 'done' && msg.outputUrl && (
          <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-2 space-y-2 inline-block">
            <img src={msg.outputUrl} alt="出图" className="max-w-full max-h-[60vh] rounded-lg" />
            <div className="flex flex-wrap gap-1.5 px-1">
              <Button variant="outline" size="sm" className="h-7 text-[11px]" asChild>
                <a href={msg.outputUrl} target="_blank" rel="noreferrer" download>
                  <Download className="w-3 h-3" />下载
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onCopy(msg.outputUrl!)}>
                <FileText className="w-3 h-3" />写文案
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onVideo(msg.outputUrl!)}>
                <Video className="w-3 h-3" />做视频
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatePickerInline({ onPick }: { onPick: (t: AiImageTemplate) => void }) {
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      {TEMPLATE_GROUPS.map((g) => (
        <div key={g.key}>
          <p className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold mb-1.5">{g.name}</p>
          <div className="grid grid-cols-1 gap-1.5">
            {g.templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick(t)}
                className="text-left p-2 rounded border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors"
              >
                <p className="text-[13px] font-medium">{t.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateFieldsForm({ template, onSubmit, onCancel }: { template: AiImageTemplate; onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{template.desc} · 推荐比例 {template.defaultAspect}{template.refsHint === 1 ? ' · 建议先挂一张商品图' : ''}</p>
      {template.fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <label className="text-[11px] text-muted-foreground">{f.label}</label>
          <Input
            value={values[f.key] || ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="h-9 text-[13px]"
          />
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>取消</Button>
        <Button className="flex-1" onClick={() => onSubmit(values)}>用这个模板</Button>
      </div>
    </div>
  );
}
