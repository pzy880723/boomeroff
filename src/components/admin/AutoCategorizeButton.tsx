import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  target: 'official' | 'personal';
  onDone?: () => void;
}

const LABELS = {
  official: '官方知识库',
  personal: '个人知识库',
} as const;

export function AutoCategorizeButton({ target, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-categorize-knowledge', {
        body: { mode: 'batch', target },
      });
      if (error) throw error;
      const r = data?.results?.[target];
      if (r) {
        toast.success(`已重新归类 ${LABELS[target]}：共 ${r.total} 条，更新 ${r.updated} 条${r.failed ? `，失败 ${r.failed} 条` : ''}`);
      } else {
        toast.success('已完成');
      }
      onDone?.();
    } catch (e: any) {
      toast.error('AI 分类失败：' + (e?.message || ''));
    } finally {
      setRunning(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={running}>
        {running ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
        AI 自动分类（含二级类目）
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI 重新归类「{LABELS[target]}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将对所有词条用 AI 重新判定一级品类、品牌、类型/题材，并合并同义写法（如 Sony/索尼）。已有值会被覆盖。耗时与条数成正比，请耐心等待。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void run(); }} disabled={running}>
              {running && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              开始分类
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
