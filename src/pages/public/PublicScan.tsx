import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Camera, Sparkles } from 'lucide-react';
import { CameraCapture } from '@/components/recognition/CameraCapture';
import { useGuestRecognition } from '@/hooks/useGuestRecognition';

export default function PublicScan() {
  const navigate = useNavigate();
  const { isRecognizing, recognize, remaining } = useGuestRecognition();
  const [lastImage, setLastImage] = useState<string | null>(null);

  const handleCapture = async (img: string) => {
    setLastImage(img);
    const r = await recognize(img);
    if (r) {
      // 用 sessionStorage 把结果传到结果页（避免超大 URL）
      sessionStorage.setItem('guest_result', JSON.stringify(r));
      sessionStorage.setItem('guest_result_image', img);
      navigate('/u/result');
    }
  };

  return (
    <div className="container max-w-screen-md py-4 space-y-4">
      <Card className="bg-gradient-primary text-primary-foreground border-0 shadow-md">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">拍一拍，AI 帮你认中古</div>
            <div className="text-xs opacity-90 mt-0.5">
              免登录体验
              {typeof remaining === 'number' && (
                <span className="ml-1">· 今日还可识别 {remaining} 次</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <CameraCapture onCapture={handleCapture} disabled={isRecognizing} />

      {isRecognizing && (
        <Card>
          <CardContent className="p-6 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">AI 识别中，1-3 秒…</span>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/40 border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 text-foreground/80 font-medium">
            <Camera className="w-3.5 h-3.5" /> 拍摄小贴士
          </div>
          <p>· 让商品占满画面 2/3，背景尽量干净</p>
          <p>· 有铭文/底款时单独补一张近照效果更好</p>
          <p>· 识别结果可一键匿名分享到「中古圈」</p>
        </CardContent>
      </Card>

      {lastImage && !isRecognizing && (
        <Button variant="outline" className="w-full" onClick={() => setLastImage(null)}>
          重新拍摄
        </Button>
      )}
    </div>
  );
}
