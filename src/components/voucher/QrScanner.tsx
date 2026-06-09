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
          { fps: 10, qrbox: { width: 260, height: 260 } },
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
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm">将二维码对准方框</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white">
          <X className="w-5 h-5" />
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div id={containerId} className="w-full max-w-md aspect-square bg-black rounded-xl overflow-hidden" />
      </div>
      <div className="p-4 text-center text-sm text-white/70 min-h-[3rem]">
        {starting && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在启动摄像头…
          </span>
        )}
        {error && <span className="text-red-300">{error}</span>}
      </div>
    </div>
  );
}
