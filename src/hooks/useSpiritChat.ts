import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SpiritMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // public URLs
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// 压缩到长边 1280px，jpeg 0.82
async function compressImage(file: File, maxEdge = 1280, quality = 0.82): Promise<Blob> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const ratio = Math.min(maxEdge / Math.max(img.width, img.height), 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不支持');
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('压缩失败'))), 'image/jpeg', quality),
  );
}

async function uploadOne(userId: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `spirit-chat/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('product-images').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

export function useSpiritChat() {
  const [messages, setMessages] = useState<SpiritMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'sending' | 'streaming' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: next
            .filter((m) => m.id !== asstMsg.id)
            .map((m) => ({
              role: m.role,
              content: m.content,
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
      let assembled = '';

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
            const delta = obj?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              assembled += delta;
              setMessages((prev) =>
                prev.map((m) => (m.id === asstMsg.id ? { ...m, content: assembled } : m)),
              );
            }
          } catch {
            // 忽略心跳/非 JSON 行
          }
        }
      }

      setStatus('idle');
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      const msg = e?.message || '小精灵开小差了';
      setError(msg);
      setStatus('error');
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant' && !m.content
            ? { ...m, content: `（呜…${msg}）` }
            : m,
        ),
      );
    } finally {
      abortRef.current = null;
    }
  }, [messages, status]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStatus('idle');
    setError(null);
  }, []);

  return { messages, status, error, send, stop, clear };
}
