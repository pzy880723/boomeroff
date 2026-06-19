import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { uploadMarketingImages } from '@/pages/marketing/uploadMarketingImages';

type Kind = 'photo' | 'copy' | 'video';

export function UploadAssetDialog({
  open, onOpenChange, kind, shopId, onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: Kind;
  shopId: string;
  onUploaded: (item: any) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  // copy
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  // video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  // photo (multi)
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const reset = () => {
    setTitle(''); setBodyText(''); setVideoFile(null); setPhotoFiles([]); setProgress({ done: 0, total: 0 });
  };

  const insertAsset = async (row: any) => {
    const { data, error } = await supabase
      .from('marketing_assets' as any)
      .insert({ user_id: user!.id, shop_id: shopId, ...row })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  };

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (kind === 'photo') {
        if (photoFiles.length === 0) { toast.error('请选择图片'); setBusy(false); return; }
        setProgress({ done: 0, total: photoFiles.length });
        const uploaded: any[] = [];
        // upload sequentially in small batches to keep mobile memory stable
        for (let i = 0; i < photoFiles.length; i += 3) {
          const batch = photoFiles.slice(i, i + 3);
          const urls = await uploadMarketingImages(user.id, batch, { preset: 'hd' });
          for (let j = 0; j < urls.length; j++) {
            const url = urls[j];
            if (!url) continue;
            const row = await insertAsset({
              kind: 'photo', output_url: url, input_image_urls: [url],
              meta: { source: 'manual_upload', filename: batch[j]?.name },
            });
            uploaded.push(row);
            onUploaded(row);
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }
        }
        toast.success(`已上传 ${uploaded.length} 张图片到素材库`);
      } else if (kind === 'copy') {
        const t = title.trim(); const b = bodyText.trim();
        if (!b) { toast.error('请填写文案正文'); setBusy(false); return; }
        const row = await insertAsset({
          kind: 'copy',
          output_text: b,
          meta: { source: 'manual_upload', candidates: [{ title: t, body: b, hashtags: [] }] },
        });
        onUploaded(row);
        toast.success('已加入素材库');
      } else {
        if (!videoFile) { toast.error('请选择视频文件'); setBusy(false); return; }
        if (videoFile.size > 80 * 1024 * 1024) { toast.error('视频不超过 80MB'); setBusy(false); return; }
        const ext = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
        const path = `${user.id}/manual/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('marketing-videos').upload(path, videoFile, {
          contentType: videoFile.type || 'video/mp4', upsert: false,
        });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from('marketing-videos').createSignedUrl(path, 60 * 60 * 24 * 365);
        const url = signed?.signedUrl || '';
        const row = await insertAsset({
          kind: 'video', output_url: url,
          meta: { source: 'manual_upload', status: 'succeeded', storage_path: path },
        });
        onUploaded(row);
        toast.success('已加入素材库');
      }
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const titleMap: Record<Kind, string> = { photo: '上传图片素材', copy: '上传文案素材', video: '上传视频素材' };
  const IconMap = { photo: Upload, copy: FileText, video: Video } as const;
  const Icon = IconMap[kind];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon className="w-4 h-4" />{titleMap[kind]}</DialogTitle>
        </DialogHeader>

        {kind === 'photo' && (
          <div className="space-y-3">
            <label className="block border-2 border-dashed border-accent/35 rounded-xl p-6 text-center cursor-pointer hover:bg-accent/[0.04]">
              {photoFile ? (
                <p className="text-sm">{photoFile.name}</p>
              ) : (
                <>
                  <Upload className="w-5 h-5 mx-auto mb-2 text-accent" />
                  <p className="text-sm">点击选择图片</p>
                  <p className="text-[11px] text-muted-foreground mt-1">JPG / PNG / HEIC</p>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        )}

        {kind === 'copy' && (
          <div className="space-y-3">
            <div>
              <Label className="text-[11px]">标题（可选）</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="一句标题…" />
            </div>
            <div>
              <Label className="text-[11px]">正文 *</Label>
              <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={8} maxLength={1000} placeholder="粘贴或编写文案…" />
            </div>
          </div>
        )}

        {kind === 'video' && (
          <div className="space-y-3">
            <label className="block border-2 border-dashed border-accent/35 rounded-xl p-6 text-center cursor-pointer hover:bg-accent/[0.04]">
              {videoFile ? (
                <p className="text-sm">{videoFile.name} · {(videoFile.size / 1024 / 1024).toFixed(1)}MB</p>
              ) : (
                <>
                  <Video className="w-5 h-5 mx-auto mb-2 text-accent" />
                  <p className="text-sm">点击选择视频</p>
                  <p className="text-[11px] text-muted-foreground mt-1">MP4 / MOV · 单个 ≤80MB</p>
                </>
              )}
              <input type="file" accept="video/*" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            上传到素材库
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
