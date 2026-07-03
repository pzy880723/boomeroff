import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';

interface Props {
  onScanned: (text: string) => void;
  onClose: () => void;
}

/** 全屏二维码扫描器（后置摄像头优先）。 */
export function QrScanner({ onScanned, onClose }: Props) {
  const containerId = 'voucher-qr-reader';
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const handledRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId, { verbose: false });
    scannerRef.current = scanner;
    (async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (vw: number, vh: number) => {
              const s = Math.floor(Math.min(vw, vh) * 0.75);
              return { width: s, height: s };
            },
            aspectRatio: 1,
          },
          (decoded) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onScanned(decoded);
          },
          () => undefined,
        );
        setStarting(false);
      } catch (e) {
        setError('无法启动摄像头，请检查权限');
        setStarting(false);
      }
    })();
    return () => {
      const s = scannerRef.current;
      if (s) {
        Promise.resolve(s.stop()).catch(() => undefined).finally(() => {
          try { s.clear(); } catch { /* noop */ }
        });
      }
    };
  }, [onScanned]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
      {/* 强制内部 video 充满方形容器，去掉 html5-qrcode 默认的高亮边框 */}
      <style>{`
        #${containerId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #${containerId} > div:not(#qr-shaded-region) { border: none !important; }
      `}</style>
      <div className="flex items-center justify-center p-3 text-white">
        <span className="text-sm">将二维码对准方框</span>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="relative bg-black rounded-xl overflow-hidden"
          style={{ width: 'min(86vw, 360px)', height: 'min(86vw, 360px)' }}
        >
          <div id={containerId} className="w-full h-full" />
          <div className="pointer-events-none absolute inset-[8%] rounded-xl ring-2 ring-white/80" />
        </div>
      </div>
      <div className="px-4 pt-2 text-center text-sm text-white/70 min-h-[2.5rem]">
        {starting && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在启动摄像头…
          </span>
        )}
        {error && <span className="text-red-300">{error}</span>}
      </div>
      <div className="flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭扫码"
          className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 ring-1 ring-white/30 backdrop-blur flex items-center justify-center text-white transition-colors"
        >
          <X className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
