import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface RoleOption {
  code: string;
  name: string;
}

interface RoleEditorProps {
  currentRoleCode: string | null;
  onChanged: (newRoleCode: string) => Promise<boolean>;
  disabled?: boolean;
}

export function RoleEditor({ currentRoleCode, onChanged, disabled }: RoleEditorProps) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<RoleOption[]>([]);

  useEffect(() => {
    void supabase
      .from('app_roles')
      .select('code, name')
      .order('sort_order')
      .then(({ data }) => setOptions((data ?? []) as RoleOption[]));
  }, []);

  const current = options.find((o) => o.code === currentRoleCode);

  const handle = async (code: string) => {
    if (code === currentRoleCode) return;
    setLoading(true);
    try {
      const ok = await onChanged(code);
      if (ok) {
        const target = options.find((o) => o.code === code);
        toast.success(`角色已更新为 ${target?.name ?? code}`);
      } else {
        toast.error('更新失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading || disabled}>
          {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {current?.name ?? '修改角色'}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.code}
            onClick={() => handle(o.code)}
            className={currentRoleCode === o.code ? 'bg-muted' : ''}
          >
            {o.name}
            {currentRoleCode === o.code && (
              <span className="ml-auto text-xs text-muted-foreground">当前</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
