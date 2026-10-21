import type { SandboxEvent } from "@ifss/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { sandboxApi } from "@/lib/sandbox-api";

const TTS_FAILED = "这段朗读没有成功，语音服务可能暂时不可用。";

function isSpeech(event: SandboxEvent): boolean {
  return event.kind === "post" || event.kind === "reply";
}

function speechTimeline(events: SandboxEvent[]): SandboxEvent[] {
  return events.filter(isSpeech).sort((left, right) => left.seq - right.seq);
}

export interface Narration {
  autoRead: boolean;
  toggleAutoRead: () => void;
  play: (seq: number) => void;
  speakingSeq: number | null;
  loadingSeq: number | null;
  error: string | null;
  clearError: () => void;
}

/**
 * 单条朗读 + 连续朗读。
 * 只朗读 post/reply；音色由后端按角色分配，前端只传 seq。
 */
export function useNarration(worldId: string, events: SandboxEvent[]): Narration {
  const [autoRead, setAutoRead] = useState(false);
  const [speakingSeq, setSpeakingSeq] = useState<number | null>(null);
  const [loadingSeq, setLoadingSeq] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<number[]>([]);
  const speakingRef = useRef<number | null>(null);
  const autoReadRef = useRef(false);
  const seenRef = useRef<number | null>(null);
  const startRef = useRef<(seq: number) => void>(() => {});

  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) {
      return audioRef.current;
    }
    const audio = new Audio();
    audio.preload = "none";
    audio.addEventListener("playing", () => {
      setLoadingSeq(null);
      setSpeakingSeq(speakingRef.current);
    });
    audio.addEventListener("waiting", () => {
      if (speakingRef.current !== null) {
        setLoadingSeq(speakingRef.current);
      }
    });
    audio.addEventListener("ended", () => {
      speakingRef.current = null;
      setSpeakingSeq(null);
      setLoadingSeq(null);
      const next = queueRef.current.shift();
      if (next !== undefined) {
        startRef.current(next);
      }
    });
    audio.addEventListener("error", () => {
      speakingRef.current = null;
      setSpeakingSeq(null);
      setLoadingSeq(null);
      setError(TTS_FAILED);
      const next = queueRef.current.shift();
      if (next !== undefined) {
        startRef.current(next);
      }
    });
    audioRef.current = audio;
    return audio;
  }, []);

  const start = useCallback(
    (seq: number): void => {
      const audio = ensureAudio();
      setError(null);
      setLoadingSeq(seq);
      speakingRef.current = seq;
      audio.src = sandboxApi.ttsUrl(worldId, seq);
      audio.load();
      void audio.play().catch((reason: unknown) => {
        speakingRef.current = null;
        setLoadingSeq(null);
        setSpeakingSeq(null);
        setError(
          reason instanceof Error && reason.name === "NotAllowedError"
            ? "浏览器拦截了自动播放，点一下这条发言再试。"
            : TTS_FAILED,
        );
      });
    },
    [ensureAudio, worldId],
  );
  startRef.current = start;

  const play = useCallback(
    (seq: number): void => {
      const audio = ensureAudio();
      if (speakingRef.current === seq && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
        speakingRef.current = null;
        setSpeakingSeq(null);
        setLoadingSeq(null);
        return;
      }
      queueRef.current = [];
      start(seq);
    },
    [ensureAudio, start],
  );

  const stop = useCallback((): void => {
    queueRef.current = [];
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      // 只移除 src，不再 load()：后者会触发 error 事件，误报“朗读失败”。
      audio.removeAttribute("src");
    }
    speakingRef.current = null;
    setSpeakingSeq(null);
    setLoadingSeq(null);
  }, []);

  const toggleAutoRead = useCallback((): void => {
    const next = !autoReadRef.current;
    autoReadRef.current = next;
    setAutoRead(next);
    if (!next) {
      stop();
      return;
    }
    // 点击本身就是一次用户手势，顺势读最新一条，避免浏览器把后续播放当成自动播放。
    const latest = speechTimeline(events).at(-1);
    if (latest) {
      queueRef.current = [];
      start(latest.seq);
    }
  }, [events, start, stop]);

  // 切世界时把播放、队列、去重基准全部归零；worldId 只作为重置信号，不参与读取。
  // biome-ignore lint/correctness/useExhaustiveDependencies: worldId 只用于触发重置
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    queueRef.current = [];
    speakingRef.current = null;
    seenRef.current = null;
    autoReadRef.current = false;
    setAutoRead(false);
    setSpeakingSeq(null);
    setLoadingSeq(null);
    setError(null);
  }, [worldId]);

  useEffect(() => {
    const speech = speechTimeline(events);
    const maxSeq = speech.at(-1)?.seq ?? 0;
    if (seenRef.current === null) {
      // 首次挂载不重播历史消息，只从新回合开始接。
      seenRef.current = maxSeq;
      return;
    }
    const fresh = speech.filter((event) => event.seq > (seenRef.current ?? 0));
    seenRef.current = Math.max(seenRef.current ?? 0, maxSeq);
    if (!autoReadRef.current || fresh.length === 0) {
      return;
    }
    queueRef.current.push(...fresh.map((event) => event.seq));
    if (speakingRef.current === null) {
      const next = queueRef.current.shift();
      if (next !== undefined) {
        start(next);
      }
    }
  }, [events, start]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    autoRead,
    toggleAutoRead,
    play,
    speakingSeq,
    loadingSeq,
    error,
    clearError,
  };
}
