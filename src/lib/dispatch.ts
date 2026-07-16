export interface PlatformSpec {
  platform: string;
  label: string;
  supports_video: boolean;
  supports_image_text: boolean;
  title_max: number;
  body_max: number;
  tag_max: number;
  images_min: number;
  images_max: number;
  video_seconds_min: number;
  video_seconds_max: number;
  supports_schedule: boolean;
  needs_cover: boolean;
  enabled: boolean;
  sort_order: number;
}

export interface SocialAccount {
  id: string;
  shop_id: string;
  platform: string;
  account_name: string | null;
  avatar_url: string | null;
  worker_account_id: number | null;
  cookie_status: string;
  online?: boolean | null;
  worker_online?: boolean;
  content_kinds?: string[];
}

export interface PublishTarget {
  id: string;
  job_id: string;
  account_id: string;
  platform: string;
  status: 'pending' | 'claimed' | 'queued' | 'scheduled' | 'running' | 'success' | 'failed' | 'cancelled';
  progress: number;
  platform_post_url: string | null;
  error_message: string | null;
  last_step: string | null;
  retry_count: number;
  account?: { account_name: string | null; avatar_url: string | null; platform: string };
}

export interface PublishJob {
  id: string;
  shop_id: string;
  asset_id: string | null;
  kind: 'video' | 'image_text';
  title: string | null;
  body: string | null;
  tags: string[];
  images: string[];
  cover_url: string | null;
  media_url: string | null;
  per_platform: Record<string, { title?: string; body?: string; tags?: string[]; category?: string }>;
  schedule_at: string | null;
  status: 'queued' | 'scheduled' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled';
  worker_file_path: string | null;
  created_at: string;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: '等待发布', claimed: '准备发布', queued: '排队中', scheduled: '已定时', running: '发布中',
  success: '已成功', done: '全部成功', partial: '部分成功',
  failed: '失败', cancelled: '已取消',
};

export const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  claimed: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  queued: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  running: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  partial: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  failed: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  cancelled: 'bg-muted text-muted-foreground',
};
