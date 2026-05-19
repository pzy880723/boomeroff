import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, RefreshCw, Sparkles, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  knowledgeId: string;
  kind?: 'official' | 'favorite' | 'knowledge';
  isAdmin?: boolean;
  passThreshold?: number; // 0-1, 默认 0.8
  onPassed?: (score: number, total: number) => void;
  onAttempt?: (score: number, total: number, passed: boolean) => void;
  title?: string;
  onExit?: () => void;
  hasNext?: boolean;
  onNext?: () => void;
  taskProgress?: { current: number; total: number }; // 今日任务进度
}

export function QuizDialog({ open, onOpenChange, knowledgeId, kind = 'official', isAdmin, passThreshold = 0.8, onPassed, onAttempt, title, onExit, hasNext, onNext, taskProgress }: Props) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const clearAdvance = () => {
    if (advanceTimer.current != null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setAdvancing(false);
  };
  useEffect(() => () => clearAdvance(), []);
    setLoading(true);
    setQuestions([]); setStep(0); setAnswers([]); setPicked(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-knowledge-quiz', {
        body: { id: knowledgeId, kind, force },
      });
      if (error) throw error;
      const qs = (data?.questions || []) as Question[];
      if (qs.length < 1) throw new Error('没有题目');
      setQuestions(qs);
    } catch (e: any) {
      toast.error('出题失败：' + (e?.message ?? ''));
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load(false);
  }, [open, knowledgeId]);

  const submit = () => {
    if (picked == null) return;
    const next = [...answers];
    next[step] = picked;
    setAnswers(next);
    if (step + 1 < questions.length) {
      setStep(step + 1);
      setPicked(next[step + 1] ?? null);
    } else {
      setStep(questions.length); // 完成
    }
  };

  const goBack = () => {
    if (step === 0) return;
    // 保留当前选择（如已选）
    if (picked != null) {
      const next = [...answers];
      next[step] = picked;
      setAnswers(next);
    }
    const prev = step - 1;
    setStep(prev);
    setPicked(answers[prev] ?? null);
  };

  const finished = questions.length > 0 && step >= questions.length;
  const score = answers.reduce((acc, a, i) => acc + (a === questions[i]?.correctIndex ? 1 : 0), 0);
  const passed = questions.length > 0 && score / questions.length >= passThreshold;
  const verdict = passed
    ? (score === questions.length ? '满分通关 · 已掌握，自动归档' : '通过 · 已掌握，自动归档')
    : '再练一次，争取通过';

  // 通知调用方
  useEffect(() => {
    if (!finished) return;
    onAttempt?.(score, questions.length, passed);
    if (passed) onPassed?.(score, questions.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const reset = () => { setStep(0); setAnswers([]); setPicked(null); };

  const cur = questions[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            {title || '来测一测'}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground text-sm">
            <Loader2 className="w-6 h-6 animate-spin" />
            正在出题…
          </div>
        )}

        {!loading && !finished && cur && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">第 {step + 1} / {questions.length} 题</div>
            <div className="text-base font-medium leading-relaxed">{cur.stem}</div>
            <div className="space-y-2">
              {cur.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setPicked(i)}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    picked === i ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent'
                  }`}
                >
                  <span className="text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => { if (onExit) onExit(); else onOpenChange(false); }} aria-label="退出">
                <LogOut className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={goBack} disabled={step === 0} className="shrink-0">
                <ChevronLeft className="w-4 h-4 mr-1" />上一题
              </Button>
              <Button onClick={submit} disabled={picked == null} className="flex-1">
                {step + 1 < questions.length ? '下一题' : '提交'}
              </Button>
            </div>
          </div>
        )}

        {!loading && finished && (
          <div className="space-y-4">
            {taskProgress && taskProgress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>今日进度</span>
                  <span className="tabular-nums">
                    {taskProgress.current}/{taskProgress.total}
                    {taskProgress.current < taskProgress.total && (
                      <span className="ml-1.5 text-primary">· 剩余 {taskProgress.total - taskProgress.current} 个</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.round((taskProgress.current / taskProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="text-center py-3">
              <div className="text-3xl font-bold">{score} / {questions.length}</div>
              <div className="text-sm text-muted-foreground mt-1">{verdict}</div>
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => {
                const ok = answers[i] === q.correctIndex;
                return (
                  <div key={i} className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      {ok ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                          : <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />}
                      <div className="text-sm font-medium">{q.stem}</div>
                    </div>
                    <div className="text-xs text-muted-foreground pl-6">
                      正确答案：{String.fromCharCode(65 + q.correctIndex)}. {q.options[q.correctIndex]}
                    </div>
                    {!ok && (
                      <div className="text-xs text-muted-foreground pl-6">
                        你的回答：{String.fromCharCode(65 + answers[i])}. {q.options[answers[i]]}
                      </div>
                    )}
                    <div className="text-xs pl-6 leading-relaxed">{q.explanation}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {hasNext && onNext ? (
                <>
                  <Button variant="outline" onClick={() => { if (onExit) onExit(); else onOpenChange(false); }} className="flex-1">
                    <LogOut className="w-4 h-4 mr-1.5" /> 结束今日任务
                  </Button>
                  {!passed && (
                    <Button variant="outline" onClick={reset} className="flex-1">
                      <RefreshCw className="w-4 h-4 mr-1.5" /> 再考一次
                    </Button>
                  )}
                  <Button onClick={onNext} className="flex-1">
                    下一个商品 <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => { if (onExit) onExit(); else onOpenChange(false); }} className="flex-1">
                    <LogOut className="w-4 h-4 mr-1.5" /> 结束测试
                  </Button>
                  <Button variant="outline" onClick={reset} className="flex-1">
                    <RefreshCw className="w-4 h-4 mr-1.5" /> 再考一次
                  </Button>
                  {isAdmin && (
                    <Button variant="outline" onClick={() => load(true)} className="flex-1">
                      <Sparkles className="w-4 h-4 mr-1.5" /> 换一套题
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
