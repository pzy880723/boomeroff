// 我的优惠券：管理模板 + 扫码核销
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, ScanLine, Ticket, Megaphone } from 'lucide-react';
import { VoucherEditDialog } from '@/components/voucher/VoucherEditDialog';
import { VoucherDetailDialog } from '@/components/voucher/VoucherDetailDialog';
import { QrScanner } from '@/components/voucher/QrScanner';
import { type VoucherTemplate, formatVoucherRule } from '@/lib/voucher';
import { AuthPage } from '@/components/auth/AuthPage';
import { toast } from 'sonner';

export default function VouchersMine() {
  const { user, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<VoucherTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VoucherTemplate | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [detail, setDetail] = useState<VoucherTemplate | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('vouchers')
      .select('*')
      .not('name', 'is', null)
      .order('created_at', { ascending: false });
    setVouchers((data || []) as unknown as VoucherTemplate[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!user) return <AuthPage />;
  if (!can('voucher.manage') && !can('voucher.redeem')) {
    return (
      <>
        <PageHeader title="优惠券" back="/me" />
        <div className="container max-w-screen-md mx-auto px-3 py-6">
          <Card className="p-6 text-center text-sm text-muted-foreground">
            当前账号没有优惠券相关权限
          </Card>
        </div>
      </>
    );
  }

  const handleScan = (text: string) => {
    setScanOpen(false);
    let code = '';
    try {
      const url = new URL(text);
      const m = url.pathname.match(/\/me\/vouchers\/redeem\/([A-Z0-9]+)/i);
      if (m) code = m[1];
    } catch {
      // 也允许扫到纯券码
      if (/^[A-Z0-9]{8}$/i.test(text.trim())) code = text.trim();
    }
    if (!code) { toast.error('无法识别的二维码'); return; }
    navigate(`/me/vouchers/redeem/${code.toUpperCase()}`);
  };

  return (
    <>
      <PageHeader title="我的优惠券" back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {can('voucher.manage') && (
            <Button onClick={() => { setEditTarget(null); setEditOpen(true); }} className="h-12">
              <Plus className="w-4 h-4 mr-1.5" /> 新建优惠券
            </Button>
          )}
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
            还没创建过优惠券
          </Card>
        ) : (
          <div className="space-y-2">
            {vouchers.map((v) => (
              <button key={v.id} onClick={() => setDetail(v)} className="w-full text-left">
                <Card className="p-3 flex items-center gap-3 hover:bg-accent/10 transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center text-primary shrink-0">
                    <span className="text-[10px] leading-none">¥</span>
                    <span className="text-base font-bold tabular-nums leading-none">{v.discount_amount}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{v.name}</span>
                      {!v.active && <Badge variant="outline" className="text-[10px] px-1 py-0">停用</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {formatVoucherRule(v)} · 有效期 {v.valid_days} 天
                    </p>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <VoucherEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        userId={user.id}
        voucher={editTarget}
        onSaved={() => { load(); }}
      />

      <VoucherDetailDialog
        open={!!detail}
        voucher={detail}
        onOpenChange={(o) => { if (!o) setDetail(null); }}
        onEdit={() => {
          if (!detail) return;
          setEditTarget(detail);
          setDetail(null);
          setEditOpen(true);
        }}
      />

      {scanOpen && <QrScanner onScanned={handleScan} onClose={() => setScanOpen(false)} />}
    </>
  );
}
