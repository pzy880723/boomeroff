// 发布确认弹窗：管理员标记某位领取人是否已发布要求内容
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, ExternalLink, Upload, X as XIcon } from 'lucide-react';
import type { ActivityField, ActivityApplication } from '@/lib/voucher';
import { useAuth } from '@/hooks/useAuth';
import { ImageLightbox } from './ImageLightbox';

type AppLike = ActivityApplication;

export function PublishConfirmDialog({
  open, onOpenChange, app, fields, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  app: AppLike | null;
  fields: ActivityField[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [publishUrl, setPublishUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 主页截图（表单字段）：path -> signedUrl
  const [profileImgs, setProfileImgs] = useState<{ key: string; label: string; path: string; url: string }[]>([]);
  // 发布截图：path -> signedUrl
  const [publishImgs, setPublishImgs] = useState<{ path: string; url: string }[]>([]);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!app) return;
    setNote(app.publish_confirm_note || '');
    setPublishUrl(app.publish_url || '');

    (async () => {
      // 主页截图
      const imgFields = fields.filter((f) => f.type === 'image');
      const profile: typeof profileImgs = [];
      for (const f of imgFields) {
        const v = app.form_data?.[f.key];
        if (typeof v === 'string' && v) {
          const { data } = await supabase.storage
            .from('voucher-screenshots')
            .createSignedUrl(v, 600);
          if (data?.signedUrl) profile.push({ key: f.key, label: f.label, path: v, url: data.signedUrl });
        }
      }
      setProfileImgs(profile);

      // 发布截图
      const paths = Array.isArray(app.publish_screenshots) ? app.publish_screenshots : [];
      const pub: typeof publishImgs = [];
      for (const p of paths) {
        const { data } = await supabase.storage
          .from('voucher-screenshots')
          .createSignedUrl(p, 600);
        if (data?.signedUrl) pub.push({ path: p, url: data.signedUrl });
      }
      setPublishImgs(pub);
    })();
  }, [app, fields]);

  if (!app) return null;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !app) return;
    setUploading(true);
    try {
      const newOnes: typeof publishImgs = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} 不是图片`);
          continue;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `publish/${app.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('voucher-screenshots')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) { toast.error(`上传失败：${upErr.message}`); continue; }
        const { data } = await supabase.storage.from('voucher-screenshots').createSignedUrl(path, 600);
        if (data?.signedUrl) newOnes.push({ path, url: data.signedUrl });
      }
      setPublishImgs((arr) => [...arr, ...newOnes]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePublishImg = (path: string) => {
    setPublishImgs((arr) => arr.filter((x) => x.path !== path));
  };

  const save = async (confirmed: boolean) => {
    const url = publishUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error('发布链接需以 http(s):// 开头');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('activity_applications')
      .update({
        publish_confirmed: confirmed,
        publish_confirmed_at: confirmed ? new Date().toISOString() : null,
        publish_confirmed_by: confirmed ? user?.id ?? null : null,
        publish_confirm_note: note.trim() || null,
        publish_screenshots: publishImgs.map((x) => x.path),
        publish_url: url || null,
      })
      .eq('id', app.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(confirmed ? '已标记为已发布' : '已撤销发布确认');
    onSaved();
    onOpenChange(false);
  };

  const textFields = fields.filter((f) => f.type !== 'image');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              发布确认
              {app.publish_confirmed ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">已确认</Badge>
              ) : (
                <Badge variant="secondary">待确认</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-14 shrink-0">姓名</span>
                <span className="font-medium">{app.applicant_name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-14 shrink-0">电话</span>
                <span>{app.applicant_phone}</span>
              </div>
              {textFields.map((f) => {
                const v = app.form_data?.[f.key];
                if (v === null || v === undefined || v === '') return null;
                return (
                  <div key={f.key} className="flex gap-2">
                    <span className="text-muted-foreground w-14 shrink-0 truncate">{f.label}</span>
                    {f.type === 'url' ? (
                      <a
                        href={String(v)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline break-all inline-flex items-center gap-1"
                      >
                        {String(v)} <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="break-all">{String(v)}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {profileImgs.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">主页截图（点击放大）</p>
                <div className="grid grid-cols-2 gap-2">
                  {profileImgs.map((img, i) => (
                    <button
                      key={img.key}
                      type="button"
                      onClick={() => setLightbox({ images: profileImgs.map((x) => x.url), index: i })}
                      className="block rounded-md overflow-hidden border text-left"
                    >
                      <img src={img.url} alt={img.label} className="w-full h-32 object-cover" />
                      <p className="px-1 py-0.5 text-[10px] text-muted-foreground truncate">{img.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">发布截图（{publishImgs.length}）</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                  上传
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </div>
              {publishImgs.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {publishImgs.map((img, i) => (
                    <div key={img.path} className="relative group rounded-md overflow-hidden border">
                      <button
                        type="button"
                        onClick={() => setLightbox({ images: publishImgs.map((x) => x.url), index: i })}
                        className="block w-full"
                      >
                        <img src={img.url} alt="" className="w-full h-20 object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePublishImg(img.path)}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                        aria-label="移除"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/70 italic">尚未上传发布截图</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">备注（可选）</label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="例如：已查看小红书账号，笔记已发布"
                maxLength={200}
              />
            </div>

            {app.publish_confirmed && app.publish_confirmed_at && (
              <p className="text-[11px] text-muted-foreground">
                上次确认时间：{new Date(app.publish_confirmed_at).toLocaleString('zh-CN')}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {app.publish_confirmed ? (
              <Button
                variant="outline"
                onClick={() => save(false)}
                disabled={saving}
                className="text-destructive hover:text-destructive"
              >
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                撤销确认
              </Button>
            ) : null}
            <Button onClick={() => save(true)} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {app.publish_confirmed ? '保存修改' : '已确认发布'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        images={lightbox?.images || []}
        initialIndex={lightbox?.index || 0}
      />
    </>
  );
}
