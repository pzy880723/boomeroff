import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SpiritMascot } from './SpiritMascot';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SpiritGreetingDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[340px] rounded-3xl border-[hsl(var(--accent)/0.35)] bg-[hsl(28_18%_16%)] p-5 gap-0"
      >
        <VisuallyHidden>
          <DialogTitle>中古小精灵的问候</DialogTitle>
          <DialogDescription>关于小精灵的介绍</DialogDescription>
        </VisuallyHidden>

        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <SpiritMascot size={96} state="hover" />
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-[15px] font-bold text-[hsl(var(--primary-foreground))] mb-1.5">
              嗨～我是中古小精灵 🌱
            </div>
            <div className="text-[12.5px] leading-relaxed text-[hsl(var(--primary-foreground)/0.8)] space-y-1">
              <p>我会一直在屏幕上陪着你～</p>
              <p>
                想问排班、聊聊天，或者让我帮你打打气，
                <span className="font-semibold text-[hsl(var(--accent))]">随时点我的头像</span>
                就能找我啦！
              </p>
              <p className="text-[11px] text-[hsl(var(--primary-foreground)/0.55)]">
                （我还能被你拖到顺手的位置哦）
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={onClose}
          className="mt-5 w-full h-10 rounded-xl bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent)/0.9)] text-[hsl(var(--accent-foreground))] text-[13px] font-semibold"
        >
          好的，知道啦
        </Button>
      </DialogContent>
    </Dialog>
  );
}
