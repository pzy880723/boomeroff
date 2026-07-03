import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeFn } from '@/lib/invokeFn';

export interface SpiritRewardItem {
  kind: 'event' | 'daily';
  id: string;
  title: string;
  amount: number;
}

export interface SpiritMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  meta?: {
    reward?: {
      items: SpiritRewardItem[];
      claimed?: boolean;
    };
  };
}

export interface SpiritConversationSummary {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function uid() { return Math.random().toString(36).slice(2, 10); }

async function compressImage(file: File, maxEdge = 1280, quality = 0.82): Promise<Blob> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
  });
  const ratio = Math.min(maxEdge / Math.max(img.width, img.height), 1);
  const w = Math.round(img.width * ratio); const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas 不支持');
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('压缩失败'))), 'image/jpeg', quality));
}

async function uploadOne(userId: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `spirit-chat/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

export function useSpiritChat() {
  const [messages, setMessages] = useState<SpiritMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'sending' | 'streaming' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // rAF 批量 flush 长流式回答
  const pendingTextRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);
  const lastAsstIdRef = useRef<string | null>(null);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const text = pendingTextRef.current;
      const id = lastAsstIdRef.current;
      if (!id) return;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: text } : m)));
    });
  }, []);

  const loadConversation = useCallback(async (cid: string) => {
    abortRef.current?.abort();
    setStatus('idle');
    setError(null);
    try {
      const { data, error: e } = await invokeFn('spirit-conversations', {
        body: { action: 'messages', conversationId: cid },
      });
      if (e) throw e;
      const items: any[] = (data?.items as any[]) || [];
      setMessages(items.map((m) => ({
        id: m.id, role: m.role, content: m.content || '',
        images: Array.isArray(m.images) && m.images.length ? m.images : undefined,
      })));
      setConversationId(cid);
    } catch (err: any) {
      setError(err?.message || '加载会话失败');
    }
  }, []);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setStatus('idle');
    setError(null);
  }, []);

  const send = useCallback(async (text: string, files?: File[]) => {
    const t = (text || '').trim();
    const hasFiles = !!files && files.length > 0;
    if (!t && !hasFiles) return;
    if (status === 'sending' || status === 'streaming' || status === 'uploading') return;
    setError(null);

    let images: string[] = [];
    if (hasFiles) {
      try {
        setStatus('uploading');
        const { data: u } = await supabase.auth.getUser();
        const userId = u.user?.id;
        if (!userId) throw new Error('未登录');
        images = await Promise.all(files!.slice(0, 4).map((f) => uploadOne(userId, f)));
      } catch (e: any) {
        setError(e?.message || '图片上传失败');
        setStatus('error');
        return;
      }
    }

    const finalText = t || (hasFiles ? '帮我看看这个？' : '');
    const userMsg: SpiritMessage = { id: uid(), role: 'user', content: finalText, images: images.length ? images : undefined };
    const asstMsg: SpiritMessage = { id: uid(), role: 'assistant', content: '' };
    lastAsstIdRef.current = asstMsg.id;
    pendingTextRef.current = '';
    const next = [...messages, userMsg, asstMsg];
    setMessages(next);
    setStatus('sending');

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('未登录');

      const ac = new AbortController();
      abortRef.current = ac;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/spirit-chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messages: next
            .filter((m) => m.id !== asstMsg.id)
            .map((m) => ({
              role: m.role, content: m.content,
              ...(m.images && m.images.length ? { images: m.images } : {}),
            })),
        }),
        signal: ac.signal,
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errJson.error || `HTTP ${resp.status}`);
      }
      if (!resp.body) throw new Error('无响应');

      setStatus('streaming');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            // meta 帧（最后一条）
            if (obj.__meta) {
              if (obj.__meta.conversationId) setConversationId(obj.__meta.conversationId);
              continue;
            }
            const delta = obj?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              pendingTextRef.current += delta;
              scheduleFlush();
            }
          } catch {}
        }
      }
      // 最后一次 flush
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const finalId = lastAsstIdRef.current;
      const finalText2 = pendingTextRef.current;
      if (finalId) setMessages((prev) => prev.map((m) => (m.id === finalId ? { ...m, content: finalText2 } : m)));

      setStatus('idle');
    } catch (e: any) {
      if (e?.name === 'AbortError') { setStatus('idle'); return; }
      const msg = e?.message || 'BOOMER 开小差了';
      setError(msg);
      setStatus('error');
      const id = lastAsstIdRef.current;
      setMessages((prev) =>
        prev.map((m) => (m.id === id && !m.content ? { ...m, content: `（呜…${msg}）` } : m)),
      );
    } finally {
      abortRef.current = null;
    }
  }, [messages, status, conversationId, scheduleFlush]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setStatus('idle');
    setError(null);
  }, []);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const appendLocal = useCallback((msg: Omit<SpiritMessage, 'id'> & { id?: string }) => {
    const full: SpiritMessage = { id: msg.id ?? uid(), role: msg.role, content: msg.content, images: msg.images, meta: msg.meta };
    setMessages((prev) => [...prev, full]);
    return full.id;
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<SpiritMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch, meta: patch.meta ? { ...m.meta, ...patch.meta } : m.meta } : m)));
  }, []);

  return {
    messages, status, error, conversationId,
    send, stop, clear,
    loadConversation, newConversation,
    appendLocal, patchMessage,
  };
}

// ── 独立工具：会话列表 / 重命名 / 删除 ────────
export async function listSpiritConversations(): Promise<SpiritConversationSummary[]> {
  const { data, error } = await invokeFn('spirit-conversations', { body: { action: 'list' } });
  if (error) throw error;
  return (data?.items as SpiritConversationSummary[]) || [];
}
export async function renameSpiritConversation(id: string, title: string) {
  const { error } = await invokeFn('spirit-conversations', {
    body: { action: 'rename', conversationId: id, title },
  });
  if (error) throw error;
}
export async function deleteSpiritConversation(id: string) {
  const { error } = await invokeFn('spirit-conversations', {
    body: { action: 'delete', conversationId: id },
  });
  if (error) throw error;
}
export async function getSpiritUsage(): Promise<any[]> {
  const { data, error } = await invokeFn('spirit-conversations', { body: { action: 'usage' } });
  if (error) throw error;
  return (data?.items as any[]) || [];
}
