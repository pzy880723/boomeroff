import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface Props {
  value: string;
  size?: number;
  className?: string;
}

/** 用 canvas 绘制二维码，方便截图保存。 */
export function QrCanvas({ value, size = 220, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[QrCanvas] 渲染失败', e, 'value=', value);
    });
  }, [value, size]);
  if (!value) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: 12,
        }}
      >
        二维码生成中…
      </div>
    );
  }
  return <canvas ref={ref} width={size} height={size} className={className} aria-label="二维码" />;
}
