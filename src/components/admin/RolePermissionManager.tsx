import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Save, Trash2, ShieldCheck, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RoleRow {
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
}
interface PermissionRow {
  key: string;
  name: string;
  group: string;
  description: string | null;
  sort_order: number;
}

export function RolePermissionManager() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [perms, setPerms] = useState<PermissionRow[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [draftSet, setDraftSet] = useState<Set<string>>(new Set());
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');

  const reload = async () => {
    setLoading(true);
    const [{ data: rs }, { data: ps }, { data: rps }] = await Promise.all([
      supabase.from('app_roles').select('*').order('sort_order'),
      supabase.from('app_permissions').select('*').order('sort_order'),
      supabase.from('app_role_permissions').select('role_code, permission_key'),
    ]);
    setRoles((rs ?? []) as RoleRow[]);
    setPerms((ps ?? []) as PermissionRow[]);
    const m: Record<string, Set<string>> = {};
    (rps ?? []).forEach((r: any) => {
      (m[r.role_code] ??= new Set()).add(r.permission_key);
    });
    setMatrix(m);
    if (!activeCode && rs && rs.length > 0) setActiveCode(rs[0].code);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  // 当选中角色变化，载入草稿
  useEffect(() => {
    if (!activeCode) return;
    const r = roles.find((x) => x.code === activeCode);
    setDraftName(r?.name ?? '');
    setDraftDesc(r?.description ?? '');
    setDraftSet(new Set(matrix[activeCode] ?? []));
  }, [activeCode, roles, matrix]);

  const grouped = useMemo(() => {
    const g: Record<string, PermissionRow[]> = {};
    perms.forEach((p) => { (g[p.group] ??= []).push(p); });
    return g;
  }, [perms]);

  const togglePerm = (key: string) => {
    setDraftSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const saveActive = async () => {
    if (!activeCode) return;
    setSaving(true);
    try {
      // 名称/描述
      const { error: e1 } = await supabase
        .from('app_roles')
        .update({ name: draftName, description: draftDesc })
        .eq('code', activeCode);
      if (e1) throw e1;

      // 重置该角色的权限
      const { error: e2 } = await supabase
        .from('app_role_permissions')
        .delete()
        .eq('role_code', activeCode);
      if (e2) throw e2;

      const rows = Array.from(draftSet).map((permission_key) => ({
        role_code: activeCode,
        permission_key,
      }));
      if (rows.length > 0) {
        const { error: e3 } = await supabase.from('app_role_permissions').insert(rows);
        if (e3) throw e3;
      }
      toast.success('已保存');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCode) return;
    const target = roles.find((r) => r.code === deleteCode);
    if (target?.is_system) {
      toast.error('系统内置角色不可删除');
      setDeleteCode(null);
      return;
    }
    const { error } = await supabase.from('app_roles').delete().eq('code', deleteCode);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('已删除');
      if (activeCode === deleteCode) setActiveCode(null);
      await reload();
    }
    setDeleteCode(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = roles.find((r) => r.code === activeCode);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            角色与权限
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            在这里配置每个角色拥有的权限。修改后，对应角色的所有用户立即生效。
          </p>
        </div>
        <CreateRoleDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={async (code) => {
            await reload();
            setActiveCode(code);
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* 左侧：角色列表 */}
        <Card className="p-2 h-fit">
          <div className="space-y-1">
            {roles.map((r) => {
              const active = r.code === activeCode;
              return (
                <button
                  key={r.code}
                  onClick={() => setActiveCode(r.code)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2',
                    active ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{r.name}</span>
                      {r.is_system && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">{r.code}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {(matrix[r.code]?.size ?? 0)}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 右侧：权限矩阵 */}
        {active ? (
          <Card className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="role-name" className="text-xs">角色名称</Label>
                <Input
                  id="role-name"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={active.is_system}
                />
                {active.is_system && (
                  <p className="text-[11px] text-muted-foreground">系统角色，名称不可改</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-desc" className="text-xs">角色描述</Label>
                <Textarea
                  id="role-desc"
                  rows={2}
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{group}</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {list.map((p) => {
                      const checked = draftSet.has(p.key);
                      return (
                        <label
                          key={p.key}
                          className={cn(
                            'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors',
                            checked ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => togglePerm(p.key)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium leading-tight">{p.name}</div>
                            {p.description && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">{p.description}</div>
                            )}
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{p.key}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              {!active.is_system ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteCode(active.code)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  删除该角色
                </Button>
              ) : <div />}
              <Button onClick={saveActive} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                保存
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            请选择左侧角色
          </Card>
        )}
      </div>

      <AlertDialog open={!!deleteCode} onOpenChange={(o) => !o && setDeleteCode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该角色？</AlertDialogTitle>
            <AlertDialogDescription>
              该角色下若有用户，需要先把他们改到其他角色。删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateRoleDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!/^[a-z][a-z0-9_]{2,32}$/.test(code)) {
      toast.error('代号只能用小写字母/数字/下划线，3-33 位，以字母开头');
      return;
    }
    if (!name.trim()) { toast.error('请输入名称'); return; }
    setLoading(true);
    const { error } = await supabase.from('app_roles').insert({
      code, name: name.trim(), description: desc.trim() || null,
      is_system: false, sort_order: 99,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('已创建');
    setCode(''); setName(''); setDesc('');
    onOpenChange(false);
    onCreated(code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建角色
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建角色</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">代号 code（英文，唯一）</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="例如 senior_staff" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 资深店员" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">描述</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
