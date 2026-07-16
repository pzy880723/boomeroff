// 「让 BOOMER 替你拍一条」的核心进度视图。SurpriseVideoDialog 点「确认生成」后展示这个组件。
// 内部:轮询 job → 展示 7 步流水线 + 角色卡 + 分镜网格 + 成片播放。
import { useState } from 'react';
import { Loader2, RefreshCw, ArrowRight, Sparkles, AlertTriangle, Copy, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useDirectorJob } from '@/hooks/useDirectorJob';
import { retryShot, regenerateJob } from '@/api/videoGeneration';
import { PipelineTracker } from './PipelineTracker';
import { ShotGrid } from './ShotGrid';

export function DirectorProgress({
  jobId,
  onClose,
  onReset,
}: {
  jobId: string;
  onClose: () => void;
  onReset: () => void;
}) {
  const { data, error, refresh } = useDirectorJob(jobId);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);

  const job = data?.job;
  const shots = data?.shots || [];
  const progress = data?.progress;

  async function handleRetry(shotIndex: number) {
    setRetrying(shotIndex);
    try {
      await retryShot(jobId, shotIndex);
      toast.success(`已重新提交镜头 ${shotIndex + 1}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || '重试失败');
    } finally { setRetrying(null); }
  }

  async function handleRegen() {
    setRegenBusy(true);
    try {
      await regenerateJob(jobId);
      toast.success('已重新排队');
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || '重跑失败');
    } finally { setRegenBusy(false); }
  }

  const jobStatus = job?.status || 'queued';
  const finalUrl = job?.final_video_url || null;
  const publishAssetId = job?.meta?.generated_asset_id || null;
  const anyFailedShot = shots.some((s) => s.status === 'failed');
  const publishCopy = job?.meta?.publish_copy;
  const isWorkerComposing = (jobStatus === 'composing' && job?.compose_status && job.compose_status !== 'idle') || jobStatus === 'ready_to_stitch';
  const isStillRunning = !finalUrl && jobStatus !== 'failed';

  async function copyPublishCopy() {
    if (!publishCopy) return;
    const text = [
      publishCopy.cover_title ? `封面标题：${publishCopy.cover_title}` : '',
      publishCopy.cover_subtitle ? `封面副标题：${publishCopy.cover_subtitle}` : '',
      publishCopy.caption ? `小红书文案：\n${publishCopy.caption}` : '',
      publishCopy.douyin_caption ? `抖音文案：\n${publishCopy.douyin_caption}` : '',
      Array.isArray(publishCopy.hashtags) && publishCopy.hashtags.length ? publishCopy.hashtags.join(' ') : '',
    ].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text);
    toast.success('发布文案已复制');
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <PipelineTracker
        status={jobStatus}
        progress={progress}
      />

      {job?.character_json?.reference_image_url && (
        <div className="rounded-xl border bg-card p-2.5 flex items-center gap-3">
          <img
            src={job.character_json.reference_image_url}
            alt="角色参考图"
            className="w-14 h-[78px] rounded-md object-cover ring-1 ring-border"
          />
          <div className="text-[11px] min-w-0">
            <div className="font-medium text-foreground">今日虚构主角</div>
            {job.character_json.label && <div className="text-muted-foreground truncate">{job.character_json.label}</div>}
            {job.character_json.visual && <div className="text-muted-foreground truncate">{job.character_json.visual}</div>}
          </div>
        </div>
      )}

      <ShotGrid shots={shots} onRetry={handleRetry} retrying={retrying} />

      {isWorkerComposing && (
        <div className="rounded-lg border bg-card p-2.5 space-y-1.5 text-[12px]">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span className="font-medium">后台正在合成标准视频</span>
          </div>
          <div className="text-muted-foreground">
            状态：{jobStatus === 'ready_to_stitch' ? '准备合成' : job?.compose_status}{job?.compose_worker_id ? ` · ${job.compose_worker_id}` : ''}
          </div>
          {job.compose_heartbeat_at && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock3 className="w-3 h-3" />
              最近心跳：{new Date(job.compose_heartbeat_at).toLocaleTimeString()}
            </div>
          )}
          {job.meta?.compose_progress?.message && (
            <div className="text-muted-foreground">{job.meta.compose_progress.message}</div>
          )}
        </div>
      )}

      {finalUrl && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="aspect-[9/16] bg-black">
            <video src={finalUrl} className="w-full h-full object-contain" controls playsInline poster={job?.cover_url || undefined} />
          </div>
          <div className="p-2 text-[11px] text-muted-foreground text-center">
            成片已保存到素材库 · 可预览 / 编辑文案 / 一键发布
          </div>
        </div>
      )}

      {publishCopy && (
        <div className="rounded-xl border bg-card p-3 space-y-2 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">发布文案已生成</div>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={copyPublishCopy}>
              <Copy className="w-3 h-3 mr-1" />复制
            </Button>
          </div>
          {publishCopy.cover_title && (
            <div>
              <span className="text-muted-foreground">封面：</span>
              <span className="font-medium">{publishCopy.cover_title}</span>
              {publishCopy.cover_subtitle ? <span className="text-muted-foreground"> · {publishCopy.cover_subtitle}</span> : null}
            </div>
          )}
          {publishCopy.caption && <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">{publishCopy.caption}</p>}
          {Array.isArray(publishCopy.hashtags) && publishCopy.hashtags.length > 0 && (
            <p className="text-accent leading-relaxed">{publishCopy.hashtags.join(' ')}</p>
          )}
        </div>
      )}

      {jobStatus === 'failed' && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-[12px]">
          <div className="text-destructive font-medium flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> 这次没拍成
          </div>
          <div className="mt-1 text-foreground/80">{job?.error_message || '有镜头失败,可单镜重试或整条重拍'}</div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-[11px] text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          关闭(后台继续)
        </Button>
        {finalUrl && publishAssetId ? (
          <Link to={`/me/marketing/dispatch/workbench?asset_id=${encodeURIComponent(publishAssetId)}`} className="flex-1">
            <Button className="w-full" onClick={onClose}>
              一键发布 <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        ) : finalUrl ? (
          <Link to="/me/marketing/library" className="flex-1">
            <Button className="w-full" onClick={onClose}>去素材库 <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </Link>
        ) : anyFailedShot ? (
          <Button className="flex-1" onClick={handleRegen} disabled={regenBusy}>
            {regenBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            重跑失败镜头
          </Button>
        ) : isStillRunning ? (
          <Button className="flex-1" disabled>
            <Loader2 className="w-4 h-4 mr-1 animate-spin" /> 后台处理中
          </Button>
        ) : (
          <Button className="flex-1" onClick={onReset}>
            <Sparkles className="w-4 h-4 mr-1" /> 再拍一条
          </Button>
        )}
      </div>

      {!finalUrl && (
        <p className="text-[10px] text-center text-muted-foreground pt-1">
          关掉弹窗也会继续拍 · 成片会自动进素材库
        </p>
      )}
    </div>
  );
}
