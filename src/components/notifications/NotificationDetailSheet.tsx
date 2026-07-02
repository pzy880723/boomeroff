import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
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
  isAdmin?: boolean;
  onEdit?: (item: NotificationItem) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

export function NotificationDetailSheet({ item, onOpenChange, onOpen, isAdmin, onEdit, onDelete }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (item && onOpen) onOpen(item.id);
  }, [item, onOpen]);

  if (!item) return null;
  const meta = TYPE_LABEL[item.type] ?? { label: item.type || '通知', tone: 'bg-muted text-muted-foreground' };
  const authorName = item.author?.name || '官方';
  const authorInitial = (authorName[0] || 'O').toUpperCase();
  const publishedAt = new Date(item.created_at).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
      setConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={!!item} onOpenChange={onOpenChange}>
        <DialogContent
          className="p-0 overflow-hidden rounded-2xl flex flex-col max-h-[85vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto"
        >
          <div className="overflow-y-auto flex-1">
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.title}
                className="w-full aspect-[16/7] object-cover shrink-0"
              />
            )}
            <div className="px-5 pt-4 pb-5">
              <div className="mb-2">
                <Badge className={`${meta.tone} border-0 text-[10px] px-1.5 py-0`}>{meta.label}</Badge>
              </div>
              <h2 className="text-lg font-bold mb-3 leading-snug">{item.title}</h2>

              {/* 作者 + 发布时间 */}
              <div className="flex items-center gap-2 mb-4">
                {item.author?.avatar ? (
                  <img src={item.author.avatar} alt={authorName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {authorInitial}
                  </span>
                )}
                <span className="text-xs text-muted-foreground truncate">{authorName}</span>
                <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{publishedAt}</span>
              </div>

              {item.summary && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 pb-4 border-b border-border/50">
                  {item.summary}
                </p>
              )}
              <MarkdownArticle content={item.body || ''} />
            </div>
          </div>

          {isAdmin && (onEdit || onDelete) && (
            <div className="border-t border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-2 shrink-0">
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9"
                  onClick={() => onEdit(item)}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />编辑
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 h-9"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />删除
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除这条资讯？</AlertDialogTitle>
            <AlertDialogDescription>删除后不可恢复，所有店员将不再看到该内容。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
