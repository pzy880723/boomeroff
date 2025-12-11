import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Volume2 } from 'lucide-react';
import { RecognitionResult, ScriptStyle, SCRIPT_STYLE_LABELS, CATEGORY_LABELS } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface ScriptDisplayProps {
  result: RecognitionResult;
}

export function ScriptDisplay({ result }: ScriptDisplayProps) {
  const [copiedStyle, setCopiedStyle] = useState<ScriptStyle | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = async (text: string, style: ScriptStyle) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStyle(style);
      toast({
        title: '已复制',
        description: '话术已复制到剪贴板',
      });
      setTimeout(() => setCopiedStyle(null), 2000);
    } catch {
      toast({
        title: '复制失败',
        description: '请手动复制',
        variant: 'destructive',
      });
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{result.name}</CardTitle>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="secondary">{CATEGORY_LABELS[result.category]}</Badge>
              {result.era && <Badge variant="outline">{result.era}</Badge>}
              {result.confidence && (
                <Badge variant="outline">
                  置信度: {Math.round(result.confidence * 100)}%
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 商品信息 */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {result.material && (
            <div>
              <span className="text-muted-foreground">材质：</span>
              <span>{result.material}</span>
            </div>
          )}
          {result.craft && (
            <div>
              <span className="text-muted-foreground">工艺：</span>
              <span>{result.craft}</span>
            </div>
          )}
          {result.dimensions && (
            <div>
              <span className="text-muted-foreground">尺寸：</span>
              <span>{result.dimensions}</span>
            </div>
          )}
          {result.condition && (
            <div>
              <span className="text-muted-foreground">品相：</span>
              <span>{result.condition}</span>
            </div>
          )}
        </div>

        {result.description && (
          <p className="text-sm text-muted-foreground">{result.description}</p>
        )}

        {/* 话术切换 */}
        <Tabs defaultValue="sales" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {(Object.keys(SCRIPT_STYLE_LABELS) as ScriptStyle[]).map((style) => (
              <TabsTrigger key={style} value={style}>
                {SCRIPT_STYLE_LABELS[style]}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {(Object.keys(SCRIPT_STYLE_LABELS) as ScriptStyle[]).map((style) => (
            <TabsContent key={style} value={style} className="mt-4">
              <div className="relative">
                <div className="bg-muted rounded-lg p-4 pr-24 min-h-[120px]">
                  <p className="text-base leading-relaxed whitespace-pre-wrap">
                    {result.scripts[style] || '暂无话术'}
                  </p>
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => speakText(result.scripts[style])}
                    title={isSpeaking ? '停止播放' : '朗读话术'}
                  >
                    <Volume2 className={`w-4 h-4 ${isSpeaking ? 'text-primary' : ''}`} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(result.scripts[style], style)}
                  >
                    {copiedStyle === style ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
