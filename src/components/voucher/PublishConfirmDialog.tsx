// 发布确认弹窗：管理员标记某位领取人是否已发布要求内容
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, ExternalLink } from 'lucide-react';
import type { ActivityField, ActivityApplication } from '@/lib/voucher';
import { useAuth } from '@/hooks/useAuth';

type AppLike = ActivityApplication & {
  publish_confirmed?: boolean | null;
  publish_confirmed_at?: string | null;
  publish_confirm_note?: string | null;
};

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
  const [saving, setSaving] = useState(false);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!app) return;
    setNote(app.publish_confirm_note || '');
    // 预签名图片
    const imgFields = fields.filter((f) => f.type === 'image');
    (async () => {
      const map: Record<string, string> = {};
      for (const f of imgFields) {
        const v = app.form_data?.[f.key];
        if (typeof v === 'string' && v) {
          const { data } = await supabase.storage
            .from('voucher-screenshots')
            .createSignedUrl(v, 600);
          if (data?.signedUrl) map[f.key] = data.signedUrl;
        }
      }
      setImgUrls(map);
    })();
  }, [app, fields]);

  if (!app) return null;

  const save = async (confirmed: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from('activity_applications')
      .update({
        publish_confirmed: confirmed,
        publish_confirmed_at: confirmed ? new Date().toISOString() : null,
        publish_confirmed_by: confirmed ? user?.id ?? null : null,
        publish_confirm_note: note.trim() || null,
      })
      .eq('id', app.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(confirmed ? '已标记为已发布' : '已撤销发布确认');
    onSaved();
    onOpenChange(false);
  };

  // 文本/链接字段（账号名等）
  const textFields = fields.filter((f) => f.type !== 'image');

  return (
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

          {Object.keys(imgUrls).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">主页截图</p>
              <div className="grid grid-cols-2 gap-2">
                {fields.filter((f) => f.type === 'image').map((f) => {
                  const url = imgUrls[f.key];
                  if (!url) return null;
                  return (
                    <a
                      key={f.key}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-md overflow-hidden border"
                    >
                      <img src={url} alt={f.label} className="w-full h-32 object-cover" />
                      <p className="px-1 py-0.5 text-[10px] text-muted-foreground truncate">{f.label}</p>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

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
            {app.publish_confirmed ? '更新备注' : '已确认发布'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
