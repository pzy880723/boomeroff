import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  imageSrc: string | null;
  aspect?: number; // width / height
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
}

async function getCroppedBlob(src: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, area.width, area.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
  });
}

export function NotificationBannerCropper({ open, imageSrc, aspect = 16 / 6, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const handleConfirm = async () => {
    if (!imageSrc || !area) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(imageSrc, area);
      await onConfirm(blob);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base">裁剪 Banner</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">拖动或缩放选择显示区域（不会压缩变形）</p>
        </DialogHeader>
        <div className="relative w-full bg-black" style={{ aspectRatio: String(aspect) }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="contain"
            />
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-1">缩放</p>
          <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={(v) => setZoom(v[0])} />
        </div>
        <DialogFooter className="px-4 pb-4">
          <Button variant="outline" onClick={onCancel} disabled={busy}>取消</Button>
          <Button onClick={handleConfirm} disabled={busy || !area}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}使用此裁剪
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
