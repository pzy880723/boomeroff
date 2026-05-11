import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Sparkles, Users, Shield } from 'lucide-react';

export default function PublicAbout() {
  return (
    <div className="container max-w-screen-md py-4 space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">关于「BOOMER-OFF 识物」</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            一个聚焦日本中古杂货的 AI 识物小工具。拍一张照片，AI 会告诉你它的年代、产地、工艺要点。
            看到有意思的物件，欢迎一键匿名分享到「中古圈」让更多人看到。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <Camera className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">免登录使用</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                拍照/上传 → AI 识别 → 查看详情，全程不需注册。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">匿名发布到中古圈</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                以「游客」身份分享你拍到的中古好物，无需暴露任何个人信息。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">想点赞/评论 / 收藏？</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                这些功能保留给中古商家店员账号。是店员？请走专用入口登录。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild>
          <Link to="/u">开始识物</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/scan">店员入口</Link>
        </Button>
      </div>
    </div>
  );
}
