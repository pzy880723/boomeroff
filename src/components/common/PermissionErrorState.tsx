// 统一权限/加载错误占位：避免页面空白，提供重试与返回入口。
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { FriendlyRpcError } from '@/lib/rpcError';

interface Props {
  error: FriendlyRpcError;
  onRetry?: () => void;
  className?: string;
  compact?: boolean; // 对话框内使用，去掉外层间距
}

export function PermissionErrorState({ error, onRetry, className, compact }: Props) {
  const navigate = useNavigate();
  const isAuth = error.kind === 'auth';
  return (
    <div className={className ?? (compact ? '' : 'p-4')}>
      <Card className="p-5 flex flex-col items-center text-center gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <div className="space-y-1">
          <div className="text-sm font-medium">{error.message}</div>
          {error.kind === 'permission' && (
            <div className="text-xs text-muted-foreground">如需访问，请联系管理员为你分配相应权限</div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> 重试
            </Button>
          )}
          {isAuth ? (
            <Button size="sm" onClick={() => navigate('/auth')}>
              <LogIn className="w-3.5 h-3.5 mr-1" /> 去登录
            </Button>
          ) : !compact ? (
            <Button size="sm" variant="secondary" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> 返回
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
