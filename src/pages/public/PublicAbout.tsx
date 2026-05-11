import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Sparkles, Users, Heart, Lightbulb } from 'lucide-react';

export default function PublicAbout() {
  return (
    <div className="container max-w-screen-md py-4 space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">中古识物 · 拍一拍认中古</h2>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed">
            店里的每件中古好物背后都有故事——一只昭和年代的清水烧茶碗、一台九十年代的 Walkman、
            一枚七十年代的玻璃胸针……货架上的小标签写不下它们的来历。
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed">
            打开相机拍一拍，AI 会告诉你这件东西的身世、工艺与玩法。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3 text-sm">
          <div className="font-medium flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" /> 怎么用
          </div>
          <ol className="space-y-2 text-sm text-foreground/85 leading-relaxed list-decimal pl-5">
            <li>在货架前对准想了解的物件，拍一张清晰照片</li>
            <li>等 1-3 秒，AI 给出名称、年代、产地和故事</li>
            <li>喜欢的话，可以一键分享到「中古圈」让更多人看见</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3 text-sm">
          <div className="font-medium flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> 关于「中古圈」
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed">
            这里汇集了顾客与店主一起拍下的中古好物，像逛市集一样滑动浏览，
            说不定你的下一件心头好就藏在其中。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="font-medium flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" /> 小提示
          </div>
          <ul className="text-sm text-foreground/85 leading-relaxed space-y-1.5 pl-1">
            <li>· 拍照尽量光线充足、主体居中</li>
            <li>· 有铭文/底款时单独补一张近照效果更好</li>
            <li>· AI 会尽力，但偶尔也会认错——欢迎多角度补拍</li>
            <li>· 完全免费，无需注册</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-gradient-primary text-primary-foreground border-0">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4" />
            <div className="font-medium text-sm">关于 BOOMER-OFF</div>
          </div>
          <p className="text-sm leading-relaxed opacity-95">
            我们是一家专注日本中古杂货的实体店，相信每件旧物都值得被重新看见。
          </p>
        </CardContent>
      </Card>

      <Button asChild className="w-full" size="lg">
        <Link to="/u">
          <Camera className="w-4 h-4 mr-2" /> 现在就拍一拍
        </Link>
      </Button>
    </div>
  );
}
