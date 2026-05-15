import { useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Sparkles, Pencil } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 用户提交补充线索后调用,父级再去重新发起识别 */
  onSubmit: (hint: string) => void;
}

const QUICK_TAGS = ['底款写着', '品牌', '年代约', '材质看起来'];

/** 失败兜底:让用户写一段文字线索(品牌、铭文、年代等),拼到 prompt 里再识别一次。 */
export function HintInputSheet({ open, onOpenChange, onSubmit }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setText(''); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Pencil className="w-4 h-4 text-accent" />
            告诉 AI 你看到了什么
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            写下你能辨认的任何线索:底款 / 铭文 / 品牌 / 年代 / 产地。一两句话就够,AI 会把它当成最高优先级的判断依据,大幅提升识别成功率。
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'例如:\n底款写着 ROYAL COPENHAGEN,蓝色三波浪标\n应该是 80 年代的丹麦皇室御用'}
            rows={5}
            className="resize-none text-[13.5px] leading-relaxed"
            autoFocus
          />

          <div className="flex flex-wrap gap-1.5">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setText((prev) => (prev ? `${prev.trim()}\n${tag}` : tag))}
                className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-[11.5px] hover:bg-accent/15 hover:text-accent transition-colors"
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>

        <SheetFooter className="mt-5 flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={!text.trim()}
            className="flex-1 gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            带这段线索再识别
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
