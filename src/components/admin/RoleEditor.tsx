import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, Shield, Store } from 'lucide-react';
import { AppRole, ROLE_LABELS } from '@/types';
import { toast } from 'sonner';

interface RoleEditorProps {
  currentRole: AppRole;
  onRoleChange: (newRole: AppRole) => Promise<boolean>;
  disabled?: boolean;
}

const ROLE_OPTIONS: { value: AppRole; label: string; icon: typeof Shield }[] = [
  { value: 'admin', label: ROLE_LABELS.admin, icon: Shield },
  { value: 'anchor', label: ROLE_LABELS.anchor, icon: Store },
];

export function RoleEditor({ currentRole, onRoleChange, disabled }: RoleEditorProps) {
  const [loading, setLoading] = useState(false);

  const handleRoleChange = async (newRole: AppRole) => {
    if (newRole === currentRole) return;

    setLoading(true);
    try {
      const success = await onRoleChange(newRole);
      if (success) {
        toast.success(`角色已更新为 ${ROLE_LABELS[newRole]}`);
      } else {
        toast.error('更新失败');
      }
    } catch (error) {
      toast.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading || disabled}>
          修改角色
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ROLE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleRoleChange(option.value)}
            className={currentRole === option.value ? 'bg-muted' : ''}
          >
            <option.icon className="mr-2 h-4 w-4" />
            {option.label}
            {currentRole === option.value && (
              <span className="ml-auto text-xs text-muted-foreground">当前</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
