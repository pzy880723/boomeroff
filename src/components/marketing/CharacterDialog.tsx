// 角色详情 / 编辑 / 删除 / 真人认证
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { IdentityVerifyDialog } from './IdentityVerifyDialog';

export function CharacterDialog({
  character, open, onOpenChange, onUpdated, onDeleted,
}: {
  character: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated: (c: any) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [local, setLocal] = useState<any | null>(null);

  useEffect(() => {
    if (character) {
      setName(character.name || '');
      setRoleLabel(character.role_label || '');
      setLocal(character);
    }
  }, [character]);

  if (!character) return null;
  const cur = local || character;
  const verified = !!cur.verified_asset_uri;

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.from('marketing_characters' as any)
      .update({ name: name.trim(), role_label: roleLabel.trim() || null })
      .eq('id', cur.id).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onUpdated(data as any);
    toast.success('已保存');
    onOpenChange(false);
  };

  const del = async () => {
    if (!confirm('确定删除这个角色？')) return;
    setDeleting(true);
    const { error } = await supabase.from('marketing_characters' as any).delete().eq('id', cur.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    onDeleted(cur.id);
    toast.success('已删除');
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">角色详情</DialogTitle>
          </DialogHeader>

          <img src={cur.cover_url} alt={cur.name} className="w-full rounded-md border border-border" />

          <div className={[
            'flex items-start gap-2 p-2.5 rounded-md border text-[11.5px]',
            verified ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5',
          ].join(' ')}>
            {verified ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-emerald-700">已通过火山真人认证</p>
                  <p className="text-muted-foreground text-[10.5px]">
                    生成视频时将自动使用私域素材，跳过真人审核拦截。
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setVerifyOpen(true)}>重新认证</Button>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-amber-700">未做真人认证</p>
                  <p className="text-muted-foreground text-[10.5px]">
                    真人形象未认证时，视频生成会被火山审核拦截。完成 H5 活体后该角色将自动豁免。
                  </p>
                </div>
                <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setVerifyOpen(true)}>去认证</Button>
              </>
            )}
          </div>

          {Array.isArray(cur.ref_image_urls) && cur.ref_image_urls.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">主体参考</p>
              <div className="grid grid-cols-4 gap-1.5">
                {cur.ref_image_urls.map((u: string) => (
                  <img key={u} src={u} className="aspect-square object-cover rounded border border-border" alt="" />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-muted-foreground">名称</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-9" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">定位</label>
              <Input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} maxLength={20} className="h-9" />
            </div>
            {cur.visual_signature && (
              <p className="text-[11px] text-muted-foreground">视觉标志：{cur.visual_signature}</p>
            )}
            {cur.core_emotion && (
              <p className="text-[11px] text-muted-foreground">核心情绪：{cur.core_emotion}</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="destructive" onClick={del} disabled={deleting} className="px-3">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>关闭</Button>
            <Button className="flex-1" onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <IdentityVerifyDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        character={cur}
        onVerified={({ asset_id, asset_uri }) => {
          const next = { ...cur, verified_asset_id: asset_id, verified_asset_uri: asset_uri, verified_at: new Date().toISOString() };
          setLocal(next);
          onUpdated(next);
        }}
      />
    </>
  );
}
