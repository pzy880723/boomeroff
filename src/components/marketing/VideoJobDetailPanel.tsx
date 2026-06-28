// VideoJobDetailPanel:展开父任务,显示每段进度 + 软通过/降级徽章。
// 数据源:marketing_video_jobs 父任务 + 子任务,realtime + 5s 轮询。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Job = {
  id: string;
  status: string;
  segment_index: number | null;
  segment_total: number | null;
  parent_job_id: string | null;
  fallback_notes: string[] | null;
  error: string | null;
};

const NOTE_LABEL: Record<string, { text: string; tone: 'ok' | 'info' | 'warn' | 'mute' }> = {
  face_soft_pass_applied: { text: '软通过 ✓', tone: 'ok' },
  face_soft_pass_auto: { text: '自动软通过', tone: 'info' },
  references_trimmed_for_safety: { text: '去多余参考图', tone: 'mute' },
  references_dropped_for_safety: { text: '纯文本兜底', tone: 'warn' },
  dropped_first_frame: { text: '去首帧', tone: 'mute' },
  text_only: { text: '纯文本兜底', tone: 'warn' },
};

function NoteBadge({ note }: { note: string }) {
  const m = NOTE_LABEL[note] || { text: note, tone: 'mute' as const };
  const cls =
    m.tone === 'ok' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' :
    m.tone === 'info' ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30' :
    m.tone === 'warn' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30' :
    'bg-muted text-muted-foreground border-border';
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${cls}`}>{m.text}</span>;
}

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中', running: '生成中', succeeded: '已完成', failed: '失败', cancelled: '已取消',
};

export function VideoJobDetailPanel({ jobId, defaultExpanded = true }: { jobId: string; defaultExpanded?: boolean }) {
  const [parent, setParent] = useState<Job | null>(null);
  const [children, setChildren] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const load = useCallback(async () => {
    const { data: p } = await supabase.from('marketing_video_jobs' as any)
      .select('id,status,segment_index,segment_total,parent_job_id,fallback_notes,error')
      .eq('id', jobId).maybeSingle();
    const pj = p as Job | null;
    setParent(pj);
    if (pj && (pj.segment_total ?? 0) > 1) {
      const { data: c } = await supabase.from('marketing_video_jobs' as any)
        .select('id,status,segment_index,segment_total,parent_job_id,fallback_notes,error')
        .eq('parent_job_id', jobId).order('segment_index', { ascending: true });
      setChildren((c as Job[]) || []);
    } else {
      setChildren([]);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`vjob:${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_video_jobs', filter: `id=eq.${jobId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_video_jobs', filter: `parent_job_id=eq.${jobId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [jobId, load]);

  const segs = useMemo(() => children.length ? children : (parent ? [parent] : []), [children, parent]);
  const done = segs.filter((s) => s.status === 'succeeded').length;
  const failed = segs.filter((s) => s.status === 'failed').length;
  const total = parent?.segment_total || segs.length || 1;
  const parentNotes = (parent?.fallback_notes || []) as string[];

  if (loading) return <div className="flex items-center gap-2 text-xs text-muted-foreground p-2"><Loader2 className="w-3 h-3 animate-spin" />加载段详情…</div>;
  if (!parent) return null;

  return (
    <div className="rounded-lg border border-border bg-card/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] hover:bg-muted/40"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="font-medium">分段进度</span>
        <span className="text-muted-foreground">{done}/{total} 完成{failed ? ` · ${failed} 失败` : ''}</span>
        {parentNotes.length > 0 && (
          <span className="ml-auto flex items-center gap-1 flex-wrap justify-end">
            {parentNotes.slice(0, 3).map((n, i) => <NoteBadge key={i} note={n} />)}
          </span>
        )}
      </button>
      {expanded && (
        <ul className="divide-y divide-border">
          {segs.map((s) => {
            const notes = (s.fallback_notes || []) as string[];
            const icon = s.status === 'succeeded' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              : s.status === 'failed' ? <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              : <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />;
            return (
              <li key={s.id} className="px-3 py-2 text-[11px] flex items-start gap-2">
                {icon}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">段 {(s.segment_index ?? 0) + 1}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">{STATUS_LABEL[s.status] || s.status}</Badge>
                    {notes.map((n, i) => <NoteBadge key={i} note={n} />)}
                  </div>
                  {s.error && <p className="text-rose-600 mt-0.5 break-all">{s.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
