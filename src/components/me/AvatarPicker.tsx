import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Camera, Sparkles, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { compressForUpload } from '@/lib/uploadImage';
import { invokeFn } from '@/lib/invokeFn';

interface Props {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  onChanged: (url: string) => void;
  size?: number;
}

export function AvatarPicker({ userId, displayName, avatarUrl, onChanged, size = 72 }: Props) {
  const [busy, setBusy] = useState<'ai' | 'upload' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAI = async () => {
    if (busy) return;
    setBusy('ai');
    try {
      const { data, error } = await invokeFn('generate-avatar', {
        body: { display_name: displayName },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.avatar_url as string | undefined;
      if (!url) throw new Error('未返回头像');
      onChanged(`${url}?v=${Date.now()}`);
      toast.success('AI 头像已生成');
    } catch (e: any) {
      toast.error(e?.message || 'AI 生成失败');
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片不能超过 5MB');
      return;
    }
    setBusy('upload');
    try {
      const compressed = await compressForUpload(file, 512, 0.85);
      const ext = compressed.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${userId}/me-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, compressed, {
        contentType: compressed.type || file.type,
        upsert: true,
        cacheControl: '604800',
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('user_id', userId);
      if (profErr) throw profErr;
      onChanged(`${url}?v=${Date.now()}`);
      toast.success('头像已更新');
    } catch (e: any) {
      toast.error(e?.message || '上传失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{ width: size, height: size }}
            disabled={!!busy}
          >
            <Avatar className="w-full h-full">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xl">
                {displayName.charAt(0).toUpperCase() || '店'}
              </AvatarFallback>
            </Avatar>
            <span className={cn(
              'absolute bottom-0 right-0 w-6 h-6 rounded-full bg-background border-2 border-background flex items-center justify-center',
              busy ? '' : 'shadow-sm'
            )}>
              <span className="w-full h-full rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => inputRef.current?.click()} disabled={!!busy}>
            <Upload className="w-4 h-4 mr-2" /> 上传图片
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAI} disabled={!!busy}>
            <Sparkles className="w-4 h-4 mr-2" /> AI 重新生成
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />
    </>
  );
}
