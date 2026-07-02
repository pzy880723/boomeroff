import { useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MarkdownArticle } from './MarkdownArticle';
import type { NotificationItem } from '@/hooks/useNotifications';

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  announcement: { label: '公告', tone: 'bg-primary/10 text-primary' },
  policy: { label: '制度', tone: 'bg-foreground/10 text-foreground' },
  activity: { label: '活动', tone: 'bg-accent/50 text-accent-foreground' },
  urgent: { label: '紧急', tone: 'bg-destructive/10 text-destructive' },
};

interface Props {
  item: (NotificationItem & { image_url?: string | null; category?: string | null }) | null;
  onOpenChange: (open: boolean) => void;
  onOpen?: (id: string) => void;
}

export function NotificationDetailSheet({ item, onOpenChange, onOpen }: Props) {
  useEffect(() => {
    if (item && onOpen) onOpen(item.id);
  }, [item, onOpen]);

  if (!item) return null;
  const meta = TYPE_LABEL[item.type] ?? { label: item.type || '通知', tone: 'bg-muted text-muted-foreground' };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[85vh] flex flex-col">
        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full aspect-[16/7] object-cover shrink-0"
          />
        )}
        <div className="px-5 pt-4 pb-5 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={`${meta.tone} border-0 text-[10px] px-1.5 py-0`}>{meta.label}</Badge>
            <span className="text-[11px] text-muted-foreground">
              {new Date(item.created_at).toLocaleString('zh-CN', {
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
          <h2 className="text-lg font-bold mb-3 leading-snug">{item.title}</h2>
          {item.summary && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 pb-4 border-b border-border/50">
              {item.summary}
            </p>
          )}
          <MarkdownArticle content={item.body || ''} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
