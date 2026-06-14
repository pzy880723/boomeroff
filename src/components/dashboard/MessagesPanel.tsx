import { SectionCard } from './primitives/SectionCard';
import { Megaphone, BellDot, BookOpen, Sparkles, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotificationItem } from '@/hooks/useNotifications';
import type { useDashboardData } from '@/hooks/useDashboardData';

interface Props {
  items: NotificationItem[];
  unread: number;
  onRead: (id: string) => void;
  onReadAll: () => void;
  learning: ReturnType<typeof useDashboardData>['learning'];
  navigate: (p: string) => void;
}

export function MessagesPanel({ items, unread, onRead, onReadAll, learning, navigate }: Props) {
  const lessons = [
    learning.sop && { key: 'sop', icon: BookOpen, label: '今日手册', title: learning.sop.title, body: learning.sop.body, path: '/me/sop' },
    learning.qa && { key: 'qa', icon: MessagesSquare, label: '顾客 Q&A', title: learning.qa.title, body: learning.qa.body, path: '/me/qa' },
    learning.daily && {
      key: 'daily', icon: Sparkles, label: '中古小知识',
      title: typeof learning.daily.content === 'object' ? (learning.daily.content?.title || '今日小知识') : '今日小知识',
      body: typeof learning.daily.content === 'object' ? (learning.daily.content?.summary || learning.daily.content?.body || '') : String(learning.daily.content || ''),
      path: '/library',
    },
  ].filter(Boolean) as Array<{ key: string; icon: any; label: string; title: string; body: string; path: string }>;

  return (
    <div className="space-y-3">
      <SectionCard className="p-4" delay={0}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {unread > 0 ? <BellDot className="w-4 h-4 text-accent" /> : <Megaphone className="w-4 h-4 text-[hsl(var(--primary-foreground)/0.5)]" />}
            <span className="text-[11px] tracking-[0.18em] text-[hsl(var(--primary-foreground)/0.5)]">系统通知</span>
            {unread > 0 && <span className="text-[11px] text-accent font-medium tabular-nums">{unread} 未读</span>}
          </div>
          {unread > 0 && (
            <button onClick={onReadAll} className="text-[11px] text-[hsl(var(--primary-foreground)/0.5)] hover:text-[hsl(var(--primary-foreground)/0.85)]">全部已读</button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-[hsl(var(--primary-foreground)/0.4)] text-center py-4">暂无系统通知</p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {items.slice(0, 6).map(n => (
              <button
                key={n.id}
                onClick={() => !n.read && onRead(n.id)}
                className={cn(
                  'w-full text-left p-2.5 rounded-lg transition-colors flex gap-3',
                  n.read ? 'hover:bg-[hsl(var(--accent)/0.05)]' : 'bg-[hsl(var(--accent)/0.08)] hover:bg-[hsl(var(--accent)/0.12)]'
                )}
              >
                <div className={cn('w-0.5 rounded-full shrink-0', n.read ? 'bg-transparent' : 'bg-accent')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', n.read ? 'text-[hsl(var(--primary-foreground)/0.75)]' : 'text-[hsl(var(--primary-foreground))] font-semibold')}>{n.title}</p>
                  {n.body && <p className="text-xs text-[hsl(var(--primary-foreground)/0.5)] mt-0.5 line-clamp-2 whitespace-pre-wrap">{n.body}</p>}
                  <p className="text-[10px] text-[hsl(var(--primary-foreground)/0.35)] mt-1">
                    {new Date(n.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {lessons.length > 0 && (
        <SectionCard className="p-4" delay={80}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-[hsl(var(--primary-foreground)/0.5)]" />
            <span className="text-[11px] tracking-[0.18em] text-[hsl(var(--primary-foreground)/0.5)]">今日学习</span>
          </div>
          <div className="space-y-2">
            {lessons.map(l => {
              const Icon = l.icon;
              return (
                <button
                  key={l.key}
                  onClick={() => navigate(l.path)}
                  className="w-full text-left p-3 rounded-lg bg-[hsl(var(--accent)/0.04)] border border-[hsl(var(--accent)/0.12)] hover:bg-[hsl(var(--accent)/0.08)] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground)/0.6)]" />
                    <span className="text-[11px] text-[hsl(var(--primary-foreground)/0.5)]">{l.label}</span>
                  </div>
                  <p className="text-sm font-semibold text-[hsl(var(--primary-foreground)/0.9)] line-clamp-1">{l.title}</p>
                  {l.body && <p className="text-xs text-[hsl(var(--primary-foreground)/0.55)] line-clamp-2 mt-0.5 leading-relaxed">{l.body}</p>}
                </button>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
