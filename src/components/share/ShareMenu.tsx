import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Share2, Link2, Download, Loader2, ImageDown } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ShareCard, type ShareCardData } from './ShareCard';

interface Props {
  data: ShareCardData;
  trigger?: React.ReactNode;
}

async function preloadImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

export function ShareMenu({ data, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const link = data.link || (typeof window !== 'undefined' ? window.location.href : '');

  const copyLink = async () => {
    try {
      // 优先用系统分享
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          await (navigator as any).share({
            title: `中古识物 · ${data.name}`,
            text: `我用「中古识物」拍了一件 ${data.name},你也来看看 →`,
            url: link,
          });
          setOpen(false);
          return;
        } catch {
          // 用户取消或不支持，回退到复制
        }
      }
      await navigator.clipboard.writeText(link);
      toast.success('链接已复制');
      setOpen(false);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  const generateImage = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      await preloadImages(cardRef.current);
      // 给图片解码一帧时间
      await new Promise((r) => setTimeout(r, 100));
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      setPreviewUrl(dataUrl);
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('生成图片失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const downloadImage = async () => {
    if (!previewUrl) return;
    const filename = `${data.name || 'boomeroff'}.png`;
    try {
      const blob = await (await fetch(previewUrl)).blob();
      const { saveToGallery } = await import('@/lib/saveToGallery');
      const r = await saveToGallery(blob, filename, 'image');
      if (r.ok) toast.success(r.target === 'gallery' ? '已保存到相册' : '已下载');
      else toast.error(r.error || '保存失败');
    } catch {
      // 兜底:传统 a[download]
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          {trigger || (
            <button
              className="w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
              aria-label="分享"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>分享</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 mt-4 pb-2">
            <button
              onClick={copyLink}
              className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border bg-card hover:bg-accent transition"
            >
              <Link2 className="w-7 h-7 text-primary" />
              <span className="text-sm font-medium">复制链接</span>
              <span className="text-[11px] text-muted-foreground">分享给好友</span>
            </button>
            <button
              onClick={generateImage}
              disabled={generating}
              className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border bg-card hover:bg-accent transition disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              ) : (
                <ImageDown className="w-7 h-7 text-primary" />
              )}
              <span className="text-sm font-medium">{generating ? '生成中…' : '保存长图'}</span>
              <span className="text-[11px] text-muted-foreground">含品牌 logo</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 离屏渲染区 */}
      <div
        style={{
          position: 'fixed',
          left: -99999,
          top: 0,
          pointerEvents: 'none',
          opacity: 0,
        }}
        aria-hidden
      >
        <ShareCard ref={cardRef} data={data} />
      </div>

      {/* 预览弹窗 */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto bg-muted/50">
            {previewUrl && (
              <img src={previewUrl} alt="分享图" className="w-full h-auto block" />
            )}
          </div>
          <div className="p-3 border-t flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPreviewUrl(null)}>
              关闭
            </Button>
            <Button className="flex-1 gap-2" onClick={downloadImage}>
              <Download className="w-4 h-4" />
              下载
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center pb-3 px-3">
            iOS 用户可长按图片选择「存储到照片」
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
