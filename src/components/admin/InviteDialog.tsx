import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Copy, Check, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AppRole, ROLE_LABELS } from '@/types';
import { useAuth } from '@/hooks/useAuth';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function InviteDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole>('anchor');
  const [expiresInDays, setExpiresInDays] = useState('7');

  const generateInvite = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const code = generateCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));

      const { error } = await supabase.from('invitations').insert({
        code,
        created_by: user.id,
        role: selectedRole,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      const link = `${window.location.origin}/invite/${code}`;
      setInviteLink(link);
      toast.success('邀请链接已生成');
    } catch (error) {
      console.error('Failed to generate invite:', error);
      toast.error('生成邀请链接失败');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('链接已复制');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setInviteLink(null);
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          邀请成员
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>邀请新成员</DialogTitle>
          <DialogDescription>
            生成邀请链接，发送给新成员完成注册
          </DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>成员角色</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anchor">{ROLE_LABELS.anchor}</SelectItem>
                  <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>有效期</Label>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 天</SelectItem>
                  <SelectItem value="3">3 天</SelectItem>
                  <SelectItem value="7">7 天</SelectItem>
                  <SelectItem value="30">30 天</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={generateInvite} disabled={loading} className="w-full">
              {loading ? '生成中...' : '生成邀请链接'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={inviteLink}
                readOnly
                className="border-0 bg-transparent p-0 focus-visible:ring-0"
              />
            </div>

            <Button onClick={copyLink} className="w-full gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  复制链接
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              链接有效期 {expiresInDays} 天，角色: {ROLE_LABELS[selectedRole]}
            </p>

            <Button variant="outline" onClick={() => setInviteLink(null)} className="w-full">
              生成新链接
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
