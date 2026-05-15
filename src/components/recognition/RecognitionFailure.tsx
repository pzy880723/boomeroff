import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, X, ImagePlus, Pencil } from 'lucide-react';

interface Props {
  /** 同一张/同一组图重新识别 */
  onRetry: () => void;
  /** 用户选择了"补一张铭牌":父级负责把追加的图片塞回去并触发识别 */
  onAppendImage: (image: string) => void;
  /** 打开"加文字描述"抽屉 */
  onOpenHint: () => void;
  onCancel: () => void;
}

/**
 * 识别失败遮罩。3 个一键兜底:
 *  ① 重新识别(主)
 *  ② 补一张铭牌 → 直接打开相册,选完追加重试
 *  ③ 加文字描述 → 打开抽屉
 */
export function RecognitionFailure({ onRetry, onAppendImage, onOpenHint, onCancel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const compress = (raw: string): Promise<string> => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = 640;
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > w) {
        height = (height * w) / width;
        width = w;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(raw);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.62));
    };
    img.onerror = () => resolve(raw);
    img.src = raw;
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const compressed = await compress(raw);
      onAppendImage(compressed);
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center animate-fade-in p-5">
      <div className="text-center text-white space-y-4 max-w-[20rem] w-full">
        <div className="w-14 h-14 mx-auto rounded-full bg-destructive/20 ring-1 ring-destructive/40 flex items-center justify-center">
          <X className="w-7 h-7 text-destructive" strokeWidth={2} />
        </div>

        <div className="space-y-1">
          <p className="font-display text-lg leading-tight">没认出来</p>
          <p className="text-white/55 text-[12px] leading-relaxed">
            可能是角度不清、光线太暗,或商品较小众。<br />
            下面三种办法,任选其一:
          </p>
        </div>

        {/* 主按钮:重新识别(同图) */}
        <Button
          onClick={onRetry}
          className="w-full h-11 gap-1.5 rounded-full"
        >
          <RotateCcw className="w-4 h-4" />
          重新识别(同一张)
        </Button>

        {/* 两个次级动作 */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="h-10 gap-1.5 rounded-full bg-white/5 backdrop-blur text-white border-white/20 hover:bg-white/15 hover:text-white text-[12.5px]"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            补一张铭牌
          </Button>
          <Button
            variant="outline"
            onClick={onOpenHint}
            className="h-10 gap-1.5 rounded-full bg-white/5 backdrop-blur text-white border-white/20 hover:bg-white/15 hover:text-white text-[12.5px]"
          >
            <Pencil className="w-3.5 h-3.5" />
            加文字描述
          </Button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-white/45 text-[12px] hover:text-white/70 transition-colors"
        >
          取消,重新拍
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
