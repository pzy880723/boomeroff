import { useState, useEffect, useCallback, useRef } from 'react';

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const currentTextRef = useRef<string | null>(null);

  // 选择最佳中文语音
  const getChineseVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    // 优先选择 Google 普通话或其他高质量中文语音
    const preferredVoices = [
      'Google 普通话',
      'Microsoft Xiaoxiao',
      'Microsoft Yunxi',
      'Tingting',
      'zh-CN',
    ];
    
    for (const preferred of preferredVoices) {
      const voice = voices.find(v => 
        v.name.includes(preferred) || v.lang.includes(preferred)
      );
      if (voice) return voice;
    }
    
    // 回退到任何中文语音
    return voices.find(v => v.lang.startsWith('zh')) || null;
  }, []);

  // 停止朗读
  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    currentTextRef.current = null;
  }, []);

  // 开始朗读
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;

    // 如果正在朗读同一段文字，停止
    if (isSpeaking && currentTextRef.current === text) {
      stop();
      return;
    }

    // 取消之前的朗读
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0; // 正常语速
    utterance.pitch = 1.0;
    
    const voice = getChineseVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      currentTextRef.current = text;
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      currentTextRef.current = null;
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      currentTextRef.current = null;
    };

    window.speechSynthesis.speak(utterance);
  }, [isSpeaking, stop, getChineseVoice]);

  // 组件卸载时停止朗读
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // 加载语音列表
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  return { isSpeaking, speak, stop };
}
