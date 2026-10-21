import type { RoundRecord, SandboxEvent, SandboxMetrics, WorldSnapshot } from "./world";

export interface RoundStartEvent {
  type: "round_start";
  data: { round: number; timeLabel: string; activeIds: string[]; gatedIds: string[] };
}

export interface ActionEvent {
  type: "action";
  data: {
    seq: number;
    round: number;
    kind: "post" | "reply" | "like";
    actorId: string;
    targetId: string | null;
    content: string;
    emotion?: { label: string; intensity: number };
  };
}

export interface InterventionEvent {
  type: "intervention";
  data: Omit<SandboxEvent, "worldId" | "payload" | "createdAt"> & {
    round: number;
    visibility: string;
    content: string;
    /** 实时帧表示已交付；回放帧不带此字段，是否生效由轮次进度判断。 */
    delivered?: boolean;
  };
}

export interface RoundEndEvent {
  type: "round_end";
  data: {
    round: number;
    spokeIds: string[];
    silentIds: string[];
    metrics: SandboxMetrics;
  };
}

export interface SnapshotEvent {
  type: "snapshot";
  data: WorldSnapshot;
}

export interface ErrorEvent {
  type: "error";
  data: { round: number; code: string; message: string };
}

export interface DoneEvent {
  type: "done";
  data: { rounds: number };
}

export type SandboxStreamEvent =
  | SnapshotEvent
  | RoundStartEvent
  | ActionEvent
  | InterventionEvent
  | RoundEndEvent
  | ErrorEvent
  | DoneEvent;

export type SandboxStreamEventType = SandboxStreamEvent["type"];

export function roundToRoundEnd(round: RoundRecord): RoundEndEvent {
  return {
    type: "round_end",
    data: {
      round: round.round,
      spokeIds: round.spokeIds,
      silentIds: round.silentIds,
      metrics: round.metrics ?? {
        emotionTemperature: 0,
        polarization: 0,
        offlineRate: 0,
        silentRate: 0,
        spreadSpeed: 0,
        escalationIndex: 0,
        tension: 0,
      },
    },
  };
}
