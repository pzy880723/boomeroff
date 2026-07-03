// 消息中心 - 内部二级 Tab:聊天 / 联系人
// - 聊天:最近会话(继承旧 StaffMessagesList 逻辑)
// - 联系人:按门店 + 岗位分组的整个组织架构
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users2, ChevronRight, Search, MessageCircle, Circle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePresence } from '@/lib/onlineStatus';

interface PeerBase {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}
interface StaffPeer extends PeerBase {
  last_message: string | null;
  last_at: string | null;
  unread: number;
}
interface ContactPeer extends PeerBase {
  real_name: string | null;
  shop_id: string | null;
  shop_name: string | null;
  position: string | null;
  role_label: string | null;
}

type InnerTab = 'chat' | 'contacts';
const INNER_TAB_META: Record<InnerTab, { label: string; icon: any }> = {
  chat: { label: '聊天', icon: MessageCircle },
  contacts: { label: '联系人', icon: Users2 },
};

const ROLE_ZH: Record<string, string> = {
  admin: '超级管理员',
  boss: '老板',
  store_manager: '店长',
  staff: '店员',
  associate: '合伙人',
  hq: '总部',
  finance: '财务',
};

export function MessagesTabs({ userId }: { userId: string }) {
  const [tab, setTab] = useState<InnerTab>(() => {
    try {
      const v = localStorage.getItem('messages-inner-tab');
      return v === 'contacts' ? 'contacts' : 'chat';
    } catch { return 'chat'; }
  });

  useEffect(() => {
    try { localStorage.setItem('messages-inner-tab', tab); } catch { /* ignore */ }
  }, [tab]);

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-full bg-muted p-0.5 w-full text-xs">
        {(['chat', 'contacts'] as InnerTab[]).map(k => {
          const Icon = INNER_TAB_META[k].icon;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'flex-1 h-7 rounded-full font-medium transition-colors inline-flex items-center justify-center gap-1',
                tab === k ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {INNER_TAB_META[k].label}
            </button>
          );
        })}
      </div>

      {tab === 'chat' ? <ChatList userId={userId} /> : <ContactsList userId={userId} />}
    </div>
  );
}

/* ============================ 聊天 ============================ */
function ChatList({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [peers, setPeers] = useState<StaffPeer[]>([]);
  const online = usePresence(userId);

  const reload = async () => {
    // 找出用户所在门店
    const { data: myStaff } = await supabase
      .from('staff_profiles')
      .select('shop_id')
      .eq('user_id', userId)
      .maybeSingle();
    const shopId = (myStaff as any)?.shop_id as string | undefined;

    let coworkerIds: string[] = [];
    if (shopId) {
      const { data } = await supabase
        .from('staff_profiles')
        .select('user_id')
        .eq('shop_id', shopId);
      coworkerIds = ((data as any[]) || []).map(r => r.user_id).filter(id => id && id !== userId);
    }
    const { data: recent } = await supabase
      .from('direct_messages')
      .select('sender_id, receiver_id, body, image_url, attachment_type, created_at, read_at')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(200);
    const lastByPeer = new Map<string, { text: string; at: string; unread: number }>();
    for (const m of (recent as any[]) || []) {
      const peerId = m.sender_id === userId ? m.receiver_id : m.sender_id;
      if (!peerId) continue;
      const text = m.body
        ? m.body
        : m.attachment_type === 'video' ? '[视频]'
        : m.attachment_type === 'file' ? '[文件]'
        : (m.image_url || m.attachment_type === 'image') ? '[图片]' : '';
      const cur = lastByPeer.get(peerId);
      if (!cur) lastByPeer.set(peerId, { text, at: m.created_at, unread: 0 });
      if (m.receiver_id === userId && !m.read_at) {
        const e = lastByPeer.get(peerId)!;
        e.unread += 1;
      }
    }
    const allIds = Array.from(new Set([...coworkerIds, ...lastByPeer.keys()]));
    let profiles: any[] = [];
    if (allIds.length) {
      const { data } = await supabase.from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', allIds);
      profiles = (data as any[]) || [];
    }
    const list: StaffPeer[] = profiles.map(p => {
      const l = lastByPeer.get(p.user_id);
      return {
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        last_message: l?.text || null,
        last_at: l?.at || null,
        unread: l?.unread || 0,
      };
    });
    // 只显示"有过对话"的会话放前面;完全没聊过的同店同事保留在下面
    list.sort((a, b) => {
      if (!!a.last_at !== !!b.last_at) return a.last_at ? -1 : 1;
      if (a.last_at && b.last_at) return b.last_at.localeCompare(a.last_at);
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
    setPeers(list);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => { if (!cancelled) await reload(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime — 有新 DM 时增量刷新
  useEffect(() => {
    const ch = supabase.channel('rt-dm-list-' + userId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${userId}`,
      }, () => { void reload(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (peers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">还没有会话</p>
        <p className="text-xs mt-1">切到「联系人」选一个同事发消息吧</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border/60 bg-background overflow-hidden divide-y divide-border/60">
      {peers.map(p => (
        <Link
          key={p.user_id}
          to={`/messages/${p.user_id}`}
          className="flex items-center gap-3 px-3 py-3 hover:bg-muted/40 active:bg-muted transition-colors"
        >
          <AvatarWithPresence name={p.display_name} avatar={p.avatar_url} online={online.has(p.user_id)} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{p.display_name || '同事'}</p>
              {p.last_at && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(p.last_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {p.last_message || (online.has(p.user_id) ? '在线 · 点击开始聊天' : '点击开始聊天')}
            </p>
          </div>
          {p.unread ? (
            <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {p.unread > 99 ? '99+' : p.unread}
            </span>
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </Link>
      ))}
    </div>
  );
}

/* ============================ 联系人 ============================ */
function ContactsList({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactPeer[]>([]);
  const [keyword, setKeyword] = useState('');
  const online = usePresence(userId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);

      // 1) 拉 staff_profiles(受 RLS 限制,同店/管理员可看)
      const { data: sp } = await supabase
        .from('staff_profiles')
        .select('user_id, shop_id, position, real_name');
      const rows = ((sp as any[]) || []).filter(r => r.user_id && r.user_id !== userId);

      const ids = Array.from(new Set(rows.map(r => r.user_id)));
      const shopIds = Array.from(new Set(rows.map(r => r.shop_id).filter(Boolean)));

      // 2) profiles(展示名 / 头像) + shops(门店名) + user_roles(角色)
      const [{ data: profs }, { data: shops }, { data: roles }] = await Promise.all([
        ids.length ? supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', ids)
          : Promise.resolve({ data: [] as any[] }),
        shopIds.length ? supabase.from('shops').select('id, name').in('id', shopIds as any)
          : Promise.resolve({ data: [] as any[] }),
        ids.length ? supabase.from('user_roles').select('user_id, role').in('user_id', ids)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const pMap = new Map<string, any>();
      for (const p of (profs as any[]) || []) pMap.set(p.user_id, p);
      const sMap = new Map<string, string>();
      for (const s of (shops as any[]) || []) sMap.set(s.id, s.name);
      const rMap = new Map<string, string>();
      for (const r of (roles as any[]) || []) if (!rMap.has(r.user_id)) rMap.set(r.user_id, r.role);

      const list: ContactPeer[] = rows.map(r => {
        const p = pMap.get(r.user_id) || {};
        return {
          user_id: r.user_id,
          display_name: p.display_name || null,
          avatar_url: p.avatar_url || null,
          real_name: r.real_name || null,
          shop_id: r.shop_id || null,
          shop_name: r.shop_id ? (sMap.get(r.shop_id) || '未命名门店') : '未分配门店',
          position: r.position || null,
          role_label: (() => {
            const code = rMap.get(r.user_id);
            return code ? (ROLE_ZH[code] || code) : null;
          })(),
        };
      });
      // 去重(同用户在多店的情况:合并展示)
      const seen = new Set<string>();
      const dedup: ContactPeer[] = [];
      for (const c of list) { if (!seen.has(c.user_id)) { seen.add(c.user_id); dedup.push(c); } }

      if (!cancelled) { setContacts(dedup); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return contacts;
    return contacts.filter(c =>
      (c.display_name || '').toLowerCase().includes(k) ||
      (c.shop_name || '').toLowerCase().includes(k) ||
      (c.position || '').toLowerCase().includes(k) ||
      (c.role_label || '').toLowerCase().includes(k),
    );
  }, [contacts, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, ContactPeer[]>();
    for (const c of filtered) {
      const key = c.shop_name || '未分配门店';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    // 每组内按在线优先 + 名字
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ao = online.has(a.user_id) ? 0 : 1;
        const bo = online.has(b.user_id) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return (a.display_name || '').localeCompare(b.display_name || '');
      });
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, online]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="搜索姓名 / 门店 / 岗位"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">还没有可见的同事</p>
          <p className="text-xs mt-1">请联系管理员在后台完善员工档案</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-10 text-xs text-muted-foreground">没有匹配的联系人</div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([shopName, list]) => (
            <div key={shopName} className="rounded-2xl border border-border/60 bg-background overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                <span>{shopName}</span>
                <span>{list.length} 人</span>
              </div>
              <div className="divide-y divide-border/60">
                {list.map(c => (
                  <Link
                    key={c.user_id}
                    to={`/messages/${c.user_id}`}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-muted/40 active:bg-muted transition-colors"
                  >
                    <AvatarWithPresence name={c.display_name} avatar={c.avatar_url} online={online.has(c.user_id)} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{c.display_name || '同事'}</p>
                        {online.has(c.user_id) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                            <Circle className="w-2 h-2 fill-current" />在线
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                        {c.role_label && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{c.role_label}</span>}
                        {c.position && <span className="truncate">· {c.position}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ Avatar ============================ */
function AvatarWithPresence({ name, avatar, online, size }: {
  name: string | null; avatar: string | null; online: boolean; size: number;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatar ? (
        <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className="w-full h-full rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold"
          style={{ fontSize: size * 0.4 }}>
          {(name || '同').slice(0, 1)}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-background" />
      )}
    </div>
  );
}
