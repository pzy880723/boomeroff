// 新建角色：上传人物照（直接保存）/ AI 生成角色身份板 / 真人快拍并自动认证
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Upload, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { uploadMarketingImages } from '@/pages/marketing/uploadMarketingImages';
import { LiveCaptureWizard } from './LiveCaptureWizard';
import { invokeFn } from '@/lib/invokeFn';

export function CharacterCreateDialog({
  open, onOpenChange, shopId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string | null;
  // autoVerify=true 时,父组件应立即拉起真人认证弹窗(真人快拍模式)
  onCreated: (character: any, opts?: { autoVerify?: boolean }) => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'ai' | 'upload' | 'live'>('live');
  const [name, setName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [extra, setExtra] = useState('');
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(''); setRoleLabel(''); setExtra(''); setRefUrls([]);
    setSubmitting(false); setUploading(false);
  };

  const onPickRef = async (files: FileList | null) => {
    if (!files || !files.length || !user) return;
    setUploading(true);
    try {
      const out = await uploadMarketingImages(user.id, Array.from(files).slice(0, 4 - refUrls.length), { preset: 'hd' });
      const urls = out.filter((u): u is string => !!u);
      setRefUrls((prev) => [...prev, ...urls].slice(0, 4));
    } catch (e: any) {
      toast.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const submitLive = async (files: File[]) => {
    if (!shopId || !user) return;
    if (!name.trim()) { toast.error('请先填写角色名称'); return; }
    setSubmitting(true);
    try {
      const out = await uploadMarketingImages(user.id, files, { preset: 'hd' });
      const urls = out.filter((u): u is string => !!u);
      if (urls.length < 3) throw new Error('部分照片上传失败,请重试');
      const { data, error } = await supabase.from('marketing_characters' as any).insert({
        shop_id: shopId,
        created_by: user.id,
        name: name.trim(),
        role_label: roleLabel.trim() || null,
        cover_url: urls[0],
        ref_image_urls: urls,
        source: 'live_capture',
        auto_anchor: false,
        meta: { capture: 'live_3shot' },
      }).select().single();
      if (error) throw error;
      toast.success('角色已建好,马上完成真人认证');
      onCreated(data as any, { autoVerify: true });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!shopId || !user) return;
    if (!name.trim()) return toast.error('请填写角色名称');
    setSubmitting(true);
    try {
      if (mode === 'upload') {
        if (!refUrls.length) {
          toast.error('请至少上传 1 张人物照');
          setSubmitting(false);
          return;
        }
        const { data, error } = await supabase.from('marketing_characters' as any).insert({
          shop_id: shopId,
          created_by: user.id,
          name: name.trim(),
          role_label: roleLabel.trim() || null,
          cover_url: refUrls[0],
          ref_image_urls: refUrls,
          source: 'uploaded',
          auto_anchor: false,
          visual_signature: extra.trim() || null,
          meta: {},
        }).select().single();
        if (error) throw error;
        toast.success('角色已加入素材库');
        onCreated(data as any);
        onOpenChange(false);
        reset();
        return;
      }
      // AI 生成
      const { data, error } = await invokeFn('generate-character-board', {
        body: {
          shop_id: shopId,
          name: name.trim(),
          role_label: roleLabel.trim(),
          extra_desc: extra.trim(),
          subject_image_urls: refUrls,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('角色身份板生成完成');
      onCreated((data as any).character);
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e?.message || '生成失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">新建角色</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 p-0.5 bg-muted rounded-md">
          <button
            onClick={() => setMode('live')}
            className={['flex-1 h-8 text-[12px] rounded transition-all flex items-center justify-center gap-1.5',
              mode === 'live' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'].join(' ')}
          ><Camera className="w-3 h-3" />真人快拍</button>
          <button
            onClick={() => setMode('upload')}
            className={['flex-1 h-8 text-[12px] rounded transition-all flex items-center justify-center gap-1.5',
              mode === 'upload' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'].join(' ')}
          ><Upload className="w-3 h-3" />上传照片</button>
          <button
            onClick={() => setMode('ai')}
            className={['flex-1 h-8 text-[12px] rounded transition-all flex items-center justify-center gap-1.5',
              mode === 'ai' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'].join(' ')}
          ><Sparkles className="w-3 h-3" />AI 身份板</button>
        </div>

        {mode === 'live' && (
          <div className="text-[11px] leading-relaxed text-muted-foreground bg-emerald-500/10 border border-emerald-500/30 rounded-md p-2">
            推荐方案 · 用前置摄像头拍 3 张真实照片,系统会自动建角色并直接拉起火山活体认证,认证通过后该角色生成视频不再被「真人审核」拦截。
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">角色名称 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例 店长 Aki" className="h-9" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">角色定位（可选）</label>
            <Input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} maxLength={20} placeholder="店长 / 熟客 / 模特" className="h-9" />
          </div>

          {mode === 'live' ? (
            <LiveCaptureWizard onConfirm={submitLive} disabled={submitting || !name.trim()} />
          ) : (
            <>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  {mode === 'ai' ? '形象描述（可选,越具体越稳）' : '视觉标志（可选）'}
                </label>
                <Textarea
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  rows={3}
                  maxLength={mode === 'ai' ? 400 : 80}
                  placeholder={mode === 'ai'
                    ? '例：30 岁出头亚洲女性，黑色齐肩短发，米白色亚麻衬衫，温柔笃定的眼神…'
                    : '例：戴金丝眼镜，左耳一颗银耳钉'}
                  className="text-[12px]"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  {mode === 'ai' ? '主体参考照（可选,最多 4 张,锁形象用）' : '人物照 *（最多 4 张,第 1 张作封面）'}
                </label>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {refUrls.map((u, i) => (
                    <div key={u} className="relative aspect-square rounded border border-border overflow-hidden">
                      <img src={u} className="w-full h-full object-cover" alt="" />
                      <button
                        onClick={() => setRefUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-0 right-0 w-4 h-4 bg-black/60 text-white text-[10px] leading-4 text-center"
                      >×</button>
                    </div>
                  ))}
                  {refUrls.length < 4 && (
                    <label className="aspect-square rounded border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors cursor-pointer">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : '+'}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPickRef(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {mode !== 'live' && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
            <Button className="flex-1" onClick={submit} disabled={submitting || uploading}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {mode === 'ai' ? '生成身份板' : '保存角色'}
            </Button>
          </div>
        )}
        {mode === 'ai' && (
          <p className="text-[10px] text-muted-foreground text-center">生成约需 10-25 秒，请稍候。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
