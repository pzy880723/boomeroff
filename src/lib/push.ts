// 移动端推送封装:本地推送 + 远程推送 token 注册
// Web 端优雅降级为 Notification API + toast(现有)
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

let inited = false;
let currentUserId: string | null = null;

const isNative = () => Capacitor.isNativePlatform();

async function ensureLocalPerm() {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const st = await LocalNotifications.checkPermissions();
    if (st.display === 'granted') return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch { return false; }
}

async function ensureRemote() {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const st = await PushNotifications.checkPermissions();
    if (st.receive !== 'granted') {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== 'granted') return;
    }
    await PushNotifications.register();
    PushNotifications.addListener('registration', async (t) => {
      if (!currentUserId) return;
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
      await supabase.from('push_tokens' as any).upsert(
        { user_id: currentUserId, platform, token: t.value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' },
      );
    });
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data: any = action.notification?.data || {};
      handleDeepLink(data);
    });
  } catch { /* ignore */ }
}

function handleDeepLink(data: Record<string, any>) {
  const url = data?.deeplink || data?.url;
  if (!url) return;
  try {
    if (url.startsWith('http')) window.location.href = url;
    else window.location.hash = url.startsWith('/') ? '#' + url : url;
  } catch { /* ignore */ }
}

export async function initPush(userId: string) {
  currentUserId = userId;
  if (inited) return;
  inited = true;

  // Web 请求通知权限(可选)
  if (!isNative() && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }

  await ensureLocalPerm();
  await ensureRemote();

  // App URL 深链
  if (isNative()) {
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('appUrlOpen', (event) => {
        try {
          const u = new URL(event.url);
          window.location.hash = '#' + (u.pathname + u.search);
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  }
}

/** 本地弹窗(App 打开或后台驻留时) */
export async function showLocalNotification(opts: {
  title: string;
  body: string;
  deeplink?: string;
  id?: number;
}) {
  const id = opts.id ?? Math.floor(Math.random() * 2_000_000_000);

  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [{
          id,
          title: opts.title,
          body: opts.body,
          extra: { deeplink: opts.deeplink },
        }],
      });
      // Native listener 只挂一次
      LocalNotifications.removeAllListeners();
      LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
        handleDeepLink((a.notification.extra as any) || {});
      });
    } catch { /* ignore */ }
    return;
  }

  // Web fallback
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(opts.title, { body: opts.body });
      n.onclick = () => { window.focus(); if (opts.deeplink) window.location.hash = '#' + opts.deeplink; };
    } catch { /* ignore */ }
  }
}

export function isPushSupported() {
  return isNative() || ('Notification' in window);
}
