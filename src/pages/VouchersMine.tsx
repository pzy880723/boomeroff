import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, ScanLine, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { NewVoucherDialog } from '@/components/voucher/NewVoucherDialog';
import { VoucherDetailDialog } from '@/components/voucher/VoucherDetailDialog';
import { QrScanner } from '@/components/voucher/QrScanner';
import {
  VOUCHER_STATUS_LABEL, VOUCHER_STATUS_VARIANT, type Voucher,
} from '@/lib/voucher';
import { AuthPage } from '@/components/auth/AuthPage';
import { toast } from 'sonner';

export default function VouchersMine() {
  const { user, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [detail, setDetail] = useState<Voucher | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('vouchers')
      .select('*, voucher_types(*)')
      .order('created_at', { ascending: false });
    setVouchers((data || []) as unknown as Voucher[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('my-vouchers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vouchers' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!user) return <AuthPage />;

  const handleScan = (text: string) => {
    setScanOpen(false);
    try {
      const url = new URL(text);
      // 匹配 /me/vouchers/redeem/<code>?t=<share_token>
      const m = url.pathname.match(/\/me\/vouchers\/redeem\/([A-Z0-9]+)/i);
      const t = url.searchParams.get('t');
      if (m && t) {
        navigate(`/me/vouchers/redeem/${m[1]}?t=${t}`);
        return;
      }
    } catch { /* not a URL */ }
    toast.error('无法识别的二维码');
  };

  return (
    <>
      <PageHeader title="我的抵用券" backTo="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setNewOpen(true)} className="h-12">
            <Plus className="w-4 h-4 mr-1.5" /> 新建抵用券
          </Button>
          {can('voucher.redeem') && (
            <Button variant="secondary" onClick={() => setScanOpen(true)} className="h-12">
              <ScanLine className="w-4 h-4 mr-1.5" /> 扫码核销
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : vouchers.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Ticket className="w-10 h-10 mx-auto mb-2 opacity-50" />
            还没创建过抵用券
          </Card>
        ) : (
          <div className="space-y-2">
            {vouchers.map((v) => (
              <button
                key={v.id}
                onClick={() => setDetail(v)}
                className="w-full text-left"
              >
                <Card className="p-3 flex items-center gap-3 hover:bg-accent/10 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Ticket className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {v.voucher_types?.name || '抵用券'}
                      </span>
                      {v.voucher_types && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          ¥{Number(v.voucher_types.face_value).toFixed(0)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {v.code}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(v.created_at), 'MM-dd HH:mm')}
                      </span>
                      {v.applicant_name && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {v.applicant_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={VOUCHER_STATUS_VARIANT[v.status]} className="shrink-0">
                    {VOUCHER_STATUS_LABEL[v.status] || v.status}
                  </Badge>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <NewVoucherDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        userId={user.id}
        onCreated={(id) => {
          load().then(() => {
            const v = vouchers.find((x) => x.id === id);
            if (v) setDetail(v);
          });
        }}
      />

      <VoucherDetailDialog
        open={!!detail}
        voucher={detail}
        onOpenChange={(o) => { if (!o) setDetail(null); }}
      />

      {scanOpen && (
        <QrScanner onScanned={handleScan} onClose={() => setScanOpen(false)} />
      )}
    </>
  );
}
