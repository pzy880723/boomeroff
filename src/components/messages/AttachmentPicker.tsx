// 附件选择器:图片 / 视频 / 文件,统一走 chat-attachments bucket
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Image as ImageIcon, Video, FileText, Loader2 } from 'lucide-react';

export type AttachmentKind = 'image' | 'video' | 'file';

export interface UploadedAttachment {
  kind: AttachmentKind;
  url: string;
  name: string;
  size: number;
  mime: string;
}

interface Props {
  userId: string;
  disabled?: boolean;
  onUploaded: (att: UploadedAttachment) => void;
}

const MAX_MB = 40;

export function AttachmentPicker({ userId, disabled, onUploaded }: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File, kind: AttachmentKind) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`文件超过 ${MAX_MB}MB,请压缩后再发送`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? '.' + ext : ''}`;
      const { error } = await supabase.storage.from('chat-attachments').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (error) throw error;
      // 私有桶:用长期签名 URL(7 天)
      const { data: signed, error: sErr } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 年
      if (sErr) throw sErr;
      onUploaded({
        kind,
        url: signed.signedUrl,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      });
    } catch (e: any) {
      toast.error('上传失败:' + (e?.message || '未知错误'));
    } finally {
      setUploading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || uploading}
            className="p-2 rounded-full hover:bg-muted disabled:opacity-50 text-muted-foreground"
            aria-label="发送附件"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-40 p-1.5">
          <button
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded hover:bg-muted text-sm"
            onClick={() => imgRef.current?.click()}
          >
            <ImageIcon className="w-4 h-4 text-primary" /> 图片
          </button>
          <button
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded hover:bg-muted text-sm"
            onClick={() => vidRef.current?.click()}
          >
            <Video className="w-4 h-4 text-primary" /> 视频
          </button>
          <button
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded hover:bg-muted text-sm"
            onClick={() => fileRef.current?.click()}
          >
            <FileText className="w-4 h-4 text-primary" /> 文件
          </button>
        </PopoverContent>
      </Popover>

      <input ref={imgRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, 'image'); e.currentTarget.value = ''; }} />
      <input ref={vidRef} type="file" accept="video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, 'video'); e.currentTarget.value = ''; }} />
      <input ref={fileRef} type="file" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, 'file'); e.currentTarget.value = ''; }} />
    </>
  );
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}
