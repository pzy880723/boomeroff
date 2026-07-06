// 2 秒轮询 director 任务,直到 done/failed。
import { useEffect, useRef, useState } from 'react';
import { getVideoJob, type DirectorPollResult } from '@/api/videoGeneration';

export function useDirectorJob(jobId: string | null, opts?: { intervalMs?: number }) {
  const [state, setState] = useState<DirectorPollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  const refresh = async (id: string) => {
    if (!alive.current) return;
    setLoading(true);
    try {
      const r = await getVideoJob(id);
      if (!alive.current) return;
      setState(r);
      setError(null);
    } catch (e: any) {
      if (!alive.current) return;
      setError(e?.message || '轮询失败');
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    if (timer.current) window.clearInterval(timer.current);
    if (!jobId) return;
    void refresh(jobId);
    timer.current = window.setInterval(() => {
      void refresh(jobId);
      const st = state?.job.status;
      if (st === 'done' || st === 'failed') {
        if (timer.current) window.clearInterval(timer.current);
      }
    }, opts?.intervalMs || 2500);
    return () => {
      alive.current = false;
      if (timer.current) window.clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return { data: state, error, loading, refresh: () => (jobId ? refresh(jobId) : Promise.resolve()) };
}
