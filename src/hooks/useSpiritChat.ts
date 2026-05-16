import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SpiritMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function useSpiritChat() {
  const [messages, setMessages] = useState<SpiritMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'sending' | 'streaming' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || status === 'sending' || status === 'streaming') return;
    setError(null);

    const userMsg: SpiritMessage = { id: uid(), role: 'user', content: t };
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
            .map((m) => ({ role: m.role, content: m.content })),
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
      // 把错误写进 assistant 占位
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
