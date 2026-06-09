import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  VOUCHER_STATUS_LABEL, VOUCHER_STATUS_VARIANT, type Voucher,
} from '@/lib/voucher';

const STATUS_TABS = ['pending_review', 'approved', 'redeemed', 'rejected', 'all'] as const;
type StatusTab = typeof STATUS_TABS[number];

export function VoucherReviewPanel() {
  const [tab, setTab] = useState<StatusTab>('pending_review');
  const [list, setList] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Voucher | null>(null);
  const [reason, setReason] = useState('');
  const [shots, setShots] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('vouchers')
      .select('*, voucher_types(*)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (tab !== 'all') q = q.eq('status', tab);
    const { data } = await q;
    const items = (data || []) as unknown as Voucher[];
    setList(items);
    // 批量获取截图签名 URL
    const paths = items.filter((v) => v.applicant_screenshot_url).map((v) => v.applicant_screenshot_url as string);
    const map: Record<string, string> = {};
    await Promise.all(paths.map(async (p) => {
      const { data: s } = await supabase.storage.from('voucher-screenshots').createSignedUrl(p, 3600);
      if (s?.signedUrl) map[p] = s.signedUrl;
    }));
    setShots(map);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (voucher_id: string, action: 'approve' | 'reject' | 'revoke', reasonText?: string) => {
    setActing(voucher_id);
    const { data, error } = await supabase.functions.invoke('voucher-review', {
      body: { voucher_id, action, reason: reasonText },
    });
    setActing(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || '操作失败');
      return;
    }
    toast.success('已处理');
    load();
  };

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
        <TabsList className="grid grid-cols-5">
          <TabsTrigger value="pending_review">待审核</TabsTrigger>
          <TabsTrigger value="approved">已发放</TabsTrigger>
          <TabsTrigger value="redeemed">已核销</TabsTrigger>
          <TabsTrigger value="rejected">已拒绝</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">暂无</Card>
          ) : (
            <div className="space-y-2">
              {list.map((v) => (
                <Card key={v.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{v.voucher_types?.name || '抵用券'}</span>
                    {v.voucher_types && <span className="text-xs text-muted-foreground">¥{Number(v.voucher_types.face_value).toFixed(0)}</span>}
                    <span className="font-mono text-[11px] text-muted-foreground">{v.code}</span>
                    <Badge variant={VOUCHER_STATUS_VARIANT[v.status]} className="ml-auto">
                      {VOUCHER_STATUS_LABEL[v.status]}
                    </Badge>
                  </div>
                  {v.applicant_name && (
                    <div className="text-xs text-muted-foreground">
                      申请人：{v.applicant_name} · {v.applicant_phone} · {v.applicant_submitted_at && format(new Date(v.applicant_submitted_at), 'MM-dd HH:mm')}
                    </div>
                  )}
                  {v.applicant_screenshot_url && shots[v.applicant_screenshot_url] && (
                    <a href={shots[v.applicant_screenshot_url]} target="_blank" rel="noreferrer">
                      <img src={shots[v.applicant_screenshot_url]} alt="主页截图" className="max-h-40 rounded border" />
                    </a>
                  )}
                  {v.note && <p className="text-xs text-muted-foreground">备注：{v.note}</p>}
                  {v.reject_reason && <p className="text-xs text-destructive">拒绝原因：{v.reject_reason}</p>}
                  {v.status === 'pending_review' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => act(v.id, 'approve')} disabled={acting === v.id}>
                        <Check className="w-4 h-4 mr-1" /> 通过
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRejecting(v); setReason(''); }}>
                        <X className="w-4 h-4 mr-1" /> 拒绝
                      </Button>
                    </div>
                  )}
                  {v.status === 'approved' && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act(v.id, 'revoke')} disabled={acting === v.id}>
                      撤销该券
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>拒绝申请</DialogTitle></DialogHeader>
          <Textarea
            placeholder="(可选) 告知客户拒绝原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={200}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>取消</Button>
            <Button variant="destructive" onClick={() => { if (rejecting) { act(rejecting.id, 'reject', reason); setRejecting(null); } }}>
              确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
