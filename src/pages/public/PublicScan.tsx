import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Sparkles } from 'lucide-react';
import { CameraStage, type CameraStageHandle } from '@/components/recognition/CameraStage';
import { useGuestRecognition } from '@/hooks/useGuestRecognition';

export default function PublicScan() {
  const navigate = useNavigate();
  const { recognize, remaining } = useGuestRecognition();
  const stageRef = useRef<CameraStageHandle>(null);

  const handleRecognize = async (images: string[]): Promise<boolean> => {
    const r = await recognize(images.length > 1 ? images : images[0]);
    if (!r) return false;
    sessionStorage.setItem('guest_result', JSON.stringify(r));
    sessionStorage.setItem('guest_result_image', images[0]);
    navigate('/u/result');
    return true;
  };

  return (
    <div className="container max-w-screen-md py-3 space-y-3">
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

      <CameraStage ref={stageRef} onRecognize={handleRecognize} keepPreviewAfterSuccess={false} />

      <Card className="bg-muted/40 border-dashed mx-3 sm:mx-4">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 text-foreground/80 font-medium">
            <Camera className="w-3.5 h-3.5" /> 拍摄小贴士
          </div>
          <p>· 让商品占满画面 2/3，背景尽量干净</p>
          <p>· 有铭文/底款时单独补一张近照效果更好</p>
          <p>· 识别结果可一键匿名分享到「中古圈」</p>
        </CardContent>
      </Card>
    </div>
  );
}
