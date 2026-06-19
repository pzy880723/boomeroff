// 角色详情 / 编辑 / 删除
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (character) {
      setName(character.name || '');
      setRoleLabel(character.role_label || '');
    }
  }, [character]);

  if (!character) return null;

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.from('marketing_characters' as any)
      .update({ name: name.trim(), role_label: roleLabel.trim() || null })
      .eq('id', character.id).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onUpdated(data as any);
    toast.success('已保存');
    onOpenChange(false);
  };

  const del = async () => {
    if (!confirm('确定删除这个角色？')) return;
    setDeleting(true);
    const { error } = await supabase.from('marketing_characters' as any).delete().eq('id', character.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    onDeleted(character.id);
    toast.success('已删除');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">角色详情</DialogTitle>
        </DialogHeader>

        <img src={character.cover_url} alt={character.name} className="w-full rounded-md border border-border" />

        {Array.isArray(character.ref_image_urls) && character.ref_image_urls.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">主体参考</p>
            <div className="grid grid-cols-4 gap-1.5">
              {character.ref_image_urls.map((u: string) => (
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
          {character.visual_signature && (
            <p className="text-[11px] text-muted-foreground">视觉标志：{character.visual_signature}</p>
          )}
          {character.core_emotion && (
            <p className="text-[11px] text-muted-foreground">核心情绪：{character.core_emotion}</p>
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
  );
}
