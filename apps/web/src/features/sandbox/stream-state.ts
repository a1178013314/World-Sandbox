import type { RoundRecord, SandboxEvent, SandboxStreamEvent, WorldSnapshot } from "@ifss/shared";

export interface LiveRound {
  round: number;
  activeIds: string[];
  gatedIds: string[];
}

export interface StreamView {
  snapshot: WorldSnapshot;
  events: SandboxEvent[];
  live: LiveRound | null;
  error: string | null;
}

export function createStreamView(snapshot: WorldSnapshot, events: SandboxEvent[]): StreamView {
  return {
    snapshot,
    events: [...events].sort((left, right) => left.seq - right.seq),
    live: null,
    error: null,
  };
}

const STREAM_TYPES = new Set<SandboxStreamEvent["type"]>([
  "snapshot",
  "round_start",
  "action",
  "intervention",
  "round_end",
  "error",
  "done",
]);

/** SSE 把事件名放在 `event:` 行、payload 放在 `data:` 行，这里把两者合回契约。 */
export function parseStreamFrame(type: string, raw: string): SandboxStreamEvent | null {
  if (!STREAM_TYPES.has(type as SandboxStreamEvent["type"])) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) {
      return null;
    }
    return { type, data } as SandboxStreamEvent;
  } catch {
    return null;
  }
}

function appendEvent(events: SandboxEvent[], event: SandboxEvent): SandboxEvent[] {
  if (events.some((item) => item.seq === event.seq)) {
    return events;
  }
  return [...events, event];
}

function upsertRound(rounds: RoundRecord[], next: RoundRecord): RoundRecord[] {
  const existing = rounds.findIndex((round) => round.round === next.round);
  if (existing === -1) {
    return [...rounds, next].sort((left, right) => left.round - right.round);
  }
  const copy = [...rounds];
  copy[existing] = { ...copy[existing], ...next };
  return copy;
}

/** SSE 帧折叠为界面状态：按 seq 去重，round_end 补齐快照里没有的轮次。 */
export function applyStreamFrame(view: StreamView, frame: SandboxStreamEvent): StreamView {
  switch (frame.type) {
    case "snapshot":
      return { ...view, snapshot: frame.data, error: null };
    case "round_start":
      return {
        ...view,
        live: {
          round: frame.data.round,
          activeIds: frame.data.activeIds,
          gatedIds: frame.data.gatedIds,
        },
        snapshot: {
          ...view.snapshot,
          world: { ...view.snapshot.world, status: "running" },
        },
      };
    case "action": {
      if (view.events.some((event) => event.seq === frame.data.seq)) {
        return view;
      }
      const event: SandboxEvent = {
        seq: frame.data.seq,
        worldId: view.snapshot.world.id,
        round: frame.data.round,
        kind: frame.data.kind,
        actorId: frame.data.actorId,
        targetId: frame.data.targetId,
        content: frame.data.content,
        payload: { emotion: frame.data.emotion },
        visibility: "public",
        createdAt: new Date().toISOString(),
      };
      return { ...view, events: appendEvent(view.events, event) };
    }
    case "intervention": {
      const delivered =
        frame.data.delivered === true || frame.data.round <= view.snapshot.world.currentRound;
      if (!delivered) {
        return view;
      }
      if (view.events.some((event) => event.seq === frame.data.seq)) {
        return view;
      }
      const event: SandboxEvent = {
        seq: frame.data.seq,
        worldId: view.snapshot.world.id,
        round: frame.data.round,
        kind: "intervention",
        actorId: null,
        targetId: frame.data.targetId,
        content: frame.data.content,
        payload: null,
        visibility: frame.data.visibility,
        createdAt: new Date().toISOString(),
      };
      return {
        ...view,
        events: appendEvent(view.events, event),
        snapshot: {
          ...view.snapshot,
          pendingInterventions: view.snapshot.pendingInterventions.filter(
            (item) => item.seq !== event.seq,
          ),
        },
      };
    }
    case "round_end": {
      const round = view.snapshot.rounds.find((item) => item.round === frame.data.round);
      const record: RoundRecord = {
        worldId: view.snapshot.world.id,
        round: frame.data.round,
        timeLabel: round?.timeLabel ?? null,
        activeIds: round?.activeIds ?? view.live?.activeIds ?? [],
        spokeIds: frame.data.spokeIds,
        silentIds: frame.data.silentIds,
        gatedIds: round?.gatedIds ?? view.live?.gatedIds ?? [],
        metrics: frame.data.metrics,
      };
      const metrics = view.snapshot.metrics.some((item) => item.round === frame.data.round)
        ? view.snapshot.metrics.map((item) =>
            item.round === frame.data.round ? { round: item.round, ...frame.data.metrics } : item,
          )
        : [...view.snapshot.metrics, { round: frame.data.round, ...frame.data.metrics }];
      return {
        ...view,
        live: null,
        snapshot: {
          ...view.snapshot,
          world: { ...view.snapshot.world, currentRound: frame.data.round },
          rounds: upsertRound(view.snapshot.rounds, record),
          metrics,
        },
      };
    }
    case "error":
      return {
        ...view,
        error: frame.data.message,
        snapshot: {
          ...view.snapshot,
          world: { ...view.snapshot.world, status: "paused", errorText: frame.data.message },
        },
      };
    case "done":
      return {
        ...view,
        live: null,
        snapshot: {
          ...view.snapshot,
          world: {
            ...view.snapshot.world,
            status: "done",
            currentRound: frame.data.rounds,
          },
        },
      };
    default:
      return view;
  }
}
