import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Send, Paperclip, X, Download, FileText, Video, Sparkles, ImagePlus, LayoutGrid, Plus, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ShopPicker } from '@/components/marketing/ShopPicker';
import { useEffectiveShop } from '@/hooks/useShops';
import { uploadMarketingImages } from './uploadMarketingImages';
import { LibraryImagePickerDialog } from '@/components/marketing/LibraryImagePickerDialog';
import { TEMPLATE_GROUPS, findTemplate, type AiImageTemplate } from './aiImageTemplates';
import { SmartAdGenerateDialog, type SmartAdResultItem } from '@/components/marketing/SmartAdGenerateDialog';
import boomerIdle from '@/assets/boomer/boomer-idle.png';

type Aspect = '1:1' | '3:4' | '9:16' | '16:9';
const ASPECTS: Aspect[] = ['1:1', '3:4', '9:16', '16:9'];

type Msg =
  | { id: string; role: 'user'; text: string; refs: string[]; aspect: Aspect; templateName?: string }
  | { id: string; role: 'ai'; status: 'loading' | 'done' | 'error'; outputUrl?: string; error?: string; label?: string };

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
  const [aspectOpen, setAspectOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
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

  // ===== 智能广告图结果注入对话流 =====
  const KIND_LABEL: Record<string, string> = { scene: '场景图', product: '商品特写', person: '人物图' };
  const onSmartAdResults = (items: SmartAdResultItem[]) => {
    if (!items?.length) return;
    const userMsgId = uid();
    setMessages((cur) => [
      ...cur,
      { id: userMsgId, role: 'user', text: `一键智能广告图 · ${items.length} 张`, refs: [], aspect, templateName: '智能广告' },
      ...items.map<Msg>((it, i) => ({
        id: uid(),
        role: 'ai',
        status: it.ok ? 'done' : 'error',
        outputUrl: it.output_url,
        error: it.error,
        label: `智能广告 · ${KIND_LABEL[it.kind] || it.kind} ${i + 1}`,
      })),
    ]);
  };

  // ===== 渲染 =====
  return (
    <>
      <PageHeader title="AI 图片" back="/me/marketing" subtitle="营销中心 / 对话出图" />

      <div className="flex flex-col h-[calc(100dvh-3.5rem-4rem)]">
        {/* 顶部:店铺选择 */}
        <div className="container mx-auto max-w-screen-md w-full px-4 pt-3 pb-2 shrink-0">
          <ShopPicker value={shopId} onChange={setShopId} locked={!isAdmin} />
        </div>

        {/* 对话流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="container mx-auto max-w-screen-md w-full space-y-4">
            {messages.length === 0 && (
              <EmptyState onSmart={() => setSmartOpen(true)} />
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

        {/* 输入区(瘦身版) */}
        <div className="border-t border-border bg-card shrink-0">
          <div className="container mx-auto max-w-screen-md w-full px-3 py-2 space-y-1.5">
            {/* 顶部工具行:模板 + 智能广告 + 比例 */}
            <div className="flex items-center gap-1.5 h-7">
              <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1">
                    <LayoutGrid className="w-3 h-3" />模板
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-3" align="start">
                  <TemplatePickerInline onPick={onPickTemplate} />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] gap-1 border-accent/40 text-accent hover:bg-accent/10"
                onClick={() => setSmartOpen(true)}
              >
                <Wand2 className="w-3 h-3" />一键智能广告图
              </Button>

              {pendingTemplate && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30 flex items-center gap-1 truncate max-w-[120px]">
                  {pendingTemplate.name}
                  <button onClick={() => setPendingTemplate(null)}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}

              <div className="ml-auto">
                <Popover open={aspectOpen} onOpenChange={setAspectOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1">
                      <AspectIcon ratio={aspect} active />
                      {aspect}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="end">
                    <div className="flex gap-1.5">
                      {ASPECTS.map((a) => (
                        <button
                          key={a}
                          onClick={() => { setAspect(a); setAspectOpen(false); }}
                          className={[
                            'flex flex-col items-center justify-center gap-0.5 px-1.5 h-11 min-w-[44px] rounded-md border transition-colors',
                            aspect === a ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-accent/50',
                          ].join(' ')}
                          aria-label={`比例 ${a}`}
                        >
                          <AspectIcon ratio={a} active={aspect === a} />
                          <span className="text-[10px] leading-none">{a}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* 附图条(瘦) */}
            {(refs.length > 0 || uploading) && (
              <div className="flex gap-1.5 items-center overflow-x-auto">
                {refs.map((url, i) => (
                  <div key={url} className="relative shrink-0 group">
                    <img src={url} alt="" className="w-10 h-10 rounded object-cover border border-border" />
                    <button
                      onClick={() => insertMention(i)}
                      className="absolute -bottom-1 -left-1 text-[9px] bg-primary text-primary-foreground rounded px-1 leading-tight"
                    >@{i + 1}</button>
                    <button
                      onClick={() => removeRef(url)}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-foreground text-background flex items-center justify-center"
                    ><X className="w-2 h-2" /></button>
                  </div>
                ))}
                {uploading && (
                  <div className="w-10 h-10 rounded border border-dashed border-border flex items-center justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  </div>
                )}
              </div>
            )}

            {/* 输入框 + 内嵌「+」 + 发送 */}
            <div className="flex items-end gap-1.5">
              <div className="relative flex-1">
                {/* @ 弹层 */}
                {mentionOpen && (
                  <div className="absolute left-0 right-0 bottom-full mb-1 z-20 bg-popover border border-border rounded-md shadow-lg p-2">
                    {refs.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground px-1 py-2">先点输入框左侧 + 加参考图,再用 @ 指定哪一张</div>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto">
                        {refs.map((url, i) => (
                          <button
                            key={url}
                            onClick={() => insertMention(i)}
                            className="relative shrink-0 rounded overflow-hidden border border-border hover:border-primary transition-colors"
                            aria-label={`插入 @img${i + 1}`}
                          >
                            <img src={url} alt="" className="w-12 h-12 object-cover" />
                            <span className="absolute bottom-0 left-0 text-[10px] bg-primary text-primary-foreground rounded-tr px-1 leading-tight">@{i + 1}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInput(v);
                    if (isComposing) return;
                    const pos = e.target.selectionStart ?? v.length;
                    const before = v.slice(0, pos);
                    const lastAt = before.lastIndexOf('@');
                    const prevChar = lastAt > 0 ? before[lastAt - 1] : '';
                    const afterAt = before.slice(lastAt + 1);
                    const validBoundary = lastAt === 0 || prevChar === ' ' || prevChar === '\n';
                    if (lastAt >= 0 && validBoundary && /^\w{0,8}$/.test(afterAt)) {
                      setMentionOpen(true);
                    } else {
                      setMentionOpen(false);
                    }
                  }}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setMentionOpen(false); return; }
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={refs.length === 0 ? '描述想要的画面…(回车发送)' : '怎么改?@ 指定参考图'}
                  rows={1}
                  className="resize-none w-full min-h-[40px] max-h-[88px] pl-9 text-[13px]"
                />
                {/* + 菜单按钮(放进 textarea 左下角) */}
                <Popover open={plusOpen} onOpenChange={setPlusOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute left-1.5 bottom-1.5 w-6 h-6 rounded-full bg-muted hover:bg-accent/15 flex items-center justify-center text-muted-foreground"
                      aria-label="添加参考图或一键生成"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="start" side="top">
                    <button
                      className="w-full flex items-center gap-2 px-2 py-2 text-[12px] rounded hover:bg-accent/10 disabled:opacity-40"
                      disabled={refs.length >= 4}
                      onClick={() => { setPlusOpen(false); fileInputRef.current?.click(); }}
                    ><Paperclip className="w-3.5 h-3.5" />上传图片</button>
                    <button
                      className="w-full flex items-center gap-2 px-2 py-2 text-[12px] rounded hover:bg-accent/10 disabled:opacity-40"
                      disabled={refs.length >= 4}
                      onClick={() => { setPlusOpen(false); setPickerOpen(true); }}
                    ><ImagePlus className="w-3.5 h-3.5" />从素材库选</button>
                    <button
                      className="w-full flex items-center gap-2 px-2 py-2 text-[12px] rounded hover:bg-accent/10 text-accent"
                      onClick={() => { setPlusOpen(false); setSmartOpen(true); }}
                    ><Wand2 className="w-3.5 h-3.5" />一键智能广告图</button>
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={send} disabled={busy || (!input.trim() && !pendingTemplate)} size="icon" className="h-9 w-9 shrink-0">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            {/* @ 提及链 */}
            {mentionedIdxs.length > 0 && (
              <div className="flex gap-1 items-center flex-wrap">
                <span className="text-[9px] text-muted-foreground">已@:</span>
                {mentionedIdxs.map((i) => (
                  <div key={i} className="relative">
                    <img src={refs[i]} alt="" className="w-6 h-6 rounded object-cover border border-primary/50" />
                    <button
                      onClick={() => removeMention(i)}
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-foreground text-background flex items-center justify-center"
                      aria-label={`移除 @${i + 1}`}
                    ><X className="w-2 h-2" /></button>
                  </div>
                ))}
              </div>
            )}
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

      <SmartAdGenerateDialog
        open={smartOpen}
        onOpenChange={setSmartOpen}
        shopId={shopId}
        onResults={onSmartAdResults}
      />
    </>
  );
}

function AspectIcon({ ratio, active }: { ratio: Aspect; active?: boolean }) {
  const dims: Record<Aspect, { w: number; h: number }> = {
    '1:1': { w: 14, h: 14 },
    '3:4': { w: 11, h: 14 },
    '9:16': { w: 8, h: 14 },
    '16:9': { w: 18, h: 10 },
  };
  const { w, h } = dims[ratio];
  return (
    <span
      aria-hidden
      className={[
        'inline-block rounded-[2px] border',
        active ? 'border-primary bg-primary/30' : 'border-muted-foreground/60',
      ].join(' ')}
      style={{ width: w, height: h }}
    />
  );
}

// ===== 子组件 =====

function EmptyState({ onSmart }: { onSmart?: () => void }) {
  return (
    <div className="pt-10 flex flex-col items-center text-center">
      <img src={boomerIdle} alt="" className="w-20 h-20 object-contain opacity-90" draggable={false} />
      <h3 className="font-display text-lg mt-3">和 BOOMER 聊出一张图</h3>
      <p className="text-[12px] text-muted-foreground mt-2 max-w-[280px] leading-relaxed">
        告诉它你想要什么 —— 文生图、改图、多图融合都行。<br />
        想批量出广告图?试试下面的「一键智能广告图」。
      </p>
      {onSmart && (
        <Button
          onClick={onSmart}
          className="mt-4 gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
          size="sm"
        >
          <Wand2 className="w-3.5 h-3.5" />一键智能广告图(自动选素材)
        </Button>
      )}
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
            {msg.label && (
              <div className="text-[10px] text-accent font-medium px-1">{msg.label}</div>
            )}
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
