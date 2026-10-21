import type { SandboxStreamEvent } from "@ifss/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { sandboxApi } from "@/lib/sandbox-api";
import {
  applyStreamFrame,
  createStreamView,
  parseStreamFrame,
  type StreamView,
} from "./stream-state";

export type StreamConnection = "connecting" | "live" | "reconnecting" | "offline" | "closed";

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000];

export function connectionDelay(attempt: number): number | null {
  return RECONNECT_DELAYS[attempt] ?? null;
}

export interface WorldStream {
  view: StreamView | null;
  connection: StreamConnection;
  reconnect: () => void;
}

/** 原生 EventSource + 自定义退避重连；seq 去重由 applyStreamFrame 保证。 */
export function useWorldStream(worldId: string | undefined): WorldStream {
  const [view, setView] = useState<StreamView | null>(null);
  const [connection, setConnection] = useState<StreamConnection>("connecting");
  const lastSeq = useRef(0);
  const attempts = useRef(0);
  const done = useRef(false);
  const activeWorld = useRef<string | undefined>(undefined);
  const reconnectRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!worldId) {
      return;
    }
    if (activeWorld.current !== worldId) {
      activeWorld.current = worldId;
      lastSeq.current = 0;
      attempts.current = 0;
      setView(null);
      setConnection("connecting");
    }
    done.current = false;
    let disposed = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handle = (raw: MessageEvent<string>): void => {
      const frame = parseStreamFrame(raw.type, raw.data);
      if (!frame) {
        return;
      }
      if ("seq" in frame.data && typeof frame.data.seq === "number") {
        lastSeq.current = Math.max(lastSeq.current, frame.data.seq);
      }
      if (frame.type === "done") {
        done.current = true;
        setConnection("closed");
        source?.close();
      }
      setView((current) => {
        if (current === null) {
          return frame.type === "snapshot" ? createStreamView(frame.data, []) : null;
        }
        return applyStreamFrame(current, frame);
      });
    };

    const types: SandboxStreamEvent["type"][] = [
      "snapshot",
      "round_start",
      "action",
      "intervention",
      "round_end",
      "error",
      "done",
    ];
    const connect = (): void => {
      if (disposed || done.current) {
        return;
      }
      source = new EventSource(
        sandboxApi.streamUrl(worldId, lastSeq.current > 0 ? lastSeq.current : undefined),
      );
      source.onopen = () => {
        attempts.current = 0;
        setConnection("live");
      };
      for (const type of types) {
        source.addEventListener(type, handle as EventListener);
      }
      source.onerror = () => {
        source?.close();
        source = null;
        if (disposed || done.current) {
          return;
        }
        const delay = connectionDelay(attempts.current);
        if (delay === null) {
          setConnection("offline");
          return;
        }
        attempts.current += 1;
        setConnection("reconnecting");
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    reconnectRef.current = () => {
      if (disposed) {
        return;
      }
      source?.close();
      source = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      connect();
    };

    return () => {
      disposed = true;
      reconnectRef.current = () => {};
      source?.close();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [worldId]);

  const reconnect = useCallback(() => {
    attempts.current = 0;
    setConnection("connecting");
    reconnectRef.current();
  }, []);

  return { view, connection, reconnect };
}
