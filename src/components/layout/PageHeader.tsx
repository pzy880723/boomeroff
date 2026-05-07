import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useLogoTapCounter, verifyPortalPassword, unlockPortal } from '@/hooks/useAdminPortal';
import { toast } from 'sonner';
import logo from '@/assets/boomer-off-vintage-logo.png';

interface PageHeaderProps {
  title: string;
  back?: string;
  right?: ReactNode;
  subtitle?: string;
}

export function PageHeader({ title, back, right, subtitle }: PageHeaderProps) {
  const navigate = useNavigate();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwdError, setPwdError] = useState(false);

  const { tap } = useLogoTapCounter(() => {
    setPwd('');
    setPwdError(false);
    setPwdOpen(true);
  });

  const handleVerify = () => {
    if (verifyPortalPassword(pwd)) {
      unlockPortal();
      setPwdOpen(false);
      setPwd('');
      toast.success('已进入后台');
      navigate('/portal');
    } else {
      setPwdError(true);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 glass safe-top">
      <div className="container mx-auto max-w-screen-md flex items-center gap-2 h-12 px-3">
        {back && (
          <Link to={back}>
            <Button variant="ghost" size="icon" className="h-9 w-9 -ml-2">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {right}
        <button
          type="button"
          onClick={tap}
          aria-label="BOOMER-OFF"
          className="shrink-0 select-none focus:outline-none ml-1 flex items-center"
        >
          <img
            src={logo}
            alt="中古商品知识系统"
            draggable={false}
            className="h-8 w-auto object-contain"
          />
        </button>
      </div>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              后台访问验证
            </DialogTitle>
            <DialogDescription>请输入后台访问密码以继续。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="请输入密码"
              value={pwd}
              autoFocus
              onChange={(e) => {
                setPwd(e.target.value);
                if (pwdError) setPwdError(false);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              className={pwdError ? 'border-destructive' : ''}
            />
            {pwdError && <p className="text-xs text-destructive">密码不正确</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>取消</Button>
            <Button onClick={handleVerify}>进入后台</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
