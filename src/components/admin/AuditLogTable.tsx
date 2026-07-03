import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCcw } from 'lucide-react';

const ACTION_LABEL: Record<string, string> = {
  'login.password': '登录（密码）',
  'login.phone': '登录（手机号）',
  'logout': '登出',
  'phone.bind': '绑定手机号',
  'user.create': '创建用户',
  'user.delete': '删除用户',
  'user.suspend': '暂停账号',
  'user.resume': '通过审核',
  'user.reset_password': '重置密码',
  'user.update_role': '修改角色',
  'user.update_profile': '编辑资料',
};

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  'login.password': 'secondary',
  'login.phone': 'secondary',
  'user.delete': 'destructive',
  'user.suspend': 'destructive',
};

interface Row {
  id: string;
  user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: any;
  user_agent: string | null;
  created_at: string;
  profile?: { display_name: string | null };
  staff?: { real_name: string | null };
  phone?: string | null;
}

export function AuditLogTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string>('all');
  const [q, setQ] = useState('');
  const [days, setDays] = useState<string>('7');

  const fetchRows = async () => {
    setLoading(true);
    try {
      let query = supabase.from('audit_logs' as any)
        .select('id, user_id, action, target_type, target_id, detail, user_agent, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (action !== 'all') query = query.eq('action', action);
      if (days !== 'all') {
        const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
        query = query.gte('created_at', since);
      }

      const { data, error } = await query;
      if (error) throw error;
      const items = (data as any[]) || [];
      const uids = Array.from(new Set(items.map((r) => r.user_id).filter(Boolean)));
      let pMap: Record<string, any> = {};
      let sMap: Record<string, any> = {};
      if (uids.length) {
        const [{ data: profs }, { data: staff }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name, phone').in('user_id', uids),
          supabase.from('staff_profiles' as any).select('user_id, real_name').in('user_id', uids),
        ]);
        (profs || []).forEach((p: any) => { pMap[p.user_id] = p; });
        (staff || []).forEach((s: any) => { sMap[s.user_id] = s; });
      }
      const enriched: Row[] = items.map((r: any) => ({
        ...r,
        profile: pMap[r.user_id],
        staff: sMap[r.user_id],
        phone: pMap[r.user_id]?.phone ?? null,
      }));
      setRows(enriched);
    } catch (e) {
      console.error('[audit] fetch', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, [action, days]);

  const filtered = q.trim()
    ? rows.filter((r) => {
        const kw = q.trim().toLowerCase();
        return (
          (r.staff?.real_name || '').toLowerCase().includes(kw) ||
          (r.profile?.display_name || '').toLowerCase().includes(kw) ||
          (r.phone || '').includes(kw)
        );
      })
    : rows;

  const formatDetail = (d: any) => {
    if (!d || typeof d !== 'object') return '';
    const parts: string[] = [];
    if (d.target_name) parts.push(String(d.target_name));
    if (d.role_code) parts.push(`角色→${d.role_code}`);
    if (d.suspended !== undefined) parts.push(d.suspended ? '暂停' : '恢复');
    if (d.phone) parts.push(`手机号 ${d.phone}`);
    if (d.reason) parts.push(String(d.reason));
    return parts.join(' · ');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按姓名/手机号搜索"
          className="h-9 w-56" />
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部动作</SelectItem>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">最近 24 小时</SelectItem>
            <SelectItem value="7">最近 7 天</SelectItem>
            <SelectItem value="30">最近 30 天</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchRows} className="gap-1.5">
          <RefreshCcw className="w-3.5 h-3.5" /> 刷新
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  {[0, 1, 2, 3].map((j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">暂无日志</TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {r.staff?.real_name || r.profile?.display_name || '未知'}
                    </div>
                    {r.phone && <div className="text-[11px] text-muted-foreground">{r.phone}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANT[r.action] || 'outline'}>
                      {ACTION_LABEL[r.action] || r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                    {formatDetail(r.detail)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
