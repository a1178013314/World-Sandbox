import { z } from "zod";

/** 世界总轮次下限：至少 20 轮，短局看不出角色之间的演化。 */
export const WORLD_MIN_ROUNDS = 20;
/** 世界总轮次上限：受调用预算与演示时长限制。 */
export const WORLD_MAX_ROUNDS = 20;

export const WorldStatusSchema = z.enum(["ready", "running", "paused", "done"]);
export type WorldStatus = z.infer<typeof WorldStatusSchema>;

export const StancePositionSchema = z.enum(["support", "oppose", "neutral", "procedural"]);
export type StancePosition = z.infer<typeof StancePositionSchema>;

export const AgentProfileSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  goals: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  voice: z.string().trim().default(""),
  stance: z.object({
    issue: z.string().trim().min(1),
    position: StancePositionSchema,
    intensity: z.number().min(0).max(1),
  }),
  influence: z.number().min(0).max(1),
  activity: z.object({
    level: z.number().min(0).max(1),
    hours: z.array(z.number().int().min(0).max(23)).min(1),
  }),
  can_see: z.array(z.string()).default([]),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export interface AgentBelief {
  known: { fact: string; ref: number | null }[];
  unknown: string[];
  relations: Record<string, number>;
  summary: string;
}

export interface AgentMemory {
  summary: string;
  recent: {
    round: number;
    kind: "saw" | "said" | "noticed";
    ref: number | null;
    gist: string;
    salience: number;
  }[];
}

export interface AgentState {
  mood: { label: string; intensity: number };
  last_spoke_round: number | null;
  silent_rounds: number;
  actions_total: number;
  spoke_streak: number;
}

export interface AgentBeliefSummary {
  agentId: string;
  profile: AgentProfile;
  belief: AgentBelief;
  memory: AgentMemory;
  state: AgentState;
}

export interface SandboxMetrics {
  emotionTemperature: number;
  polarization: number;
  offlineRate: number;
  silentRate: number;
  spreadSpeed: number;
  escalationIndex: number;
  tension: number;
}

export interface SeedConfig {
  text: string;
  /** 给观看者的事件前情；不投递给角色，避免角色知道全知视角。 */
  background?: string;
  scene: string;
  timeSlots: string[];
  gateCoefficient: number;
  renderMode: "chat";
}

export interface WorldRecord {
  id: string;
  parentId: string | null;
  forkRound: number | null;
  title: string;
  packId: string;
  seed: SeedConfig;
  castSource: "preset" | "generated";
  rngSeed: number;
  currentRound: number;
  totalRounds: number;
  status: WorldStatus;
  errorText: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EventKind = "post" | "reply" | "like" | "system" | "intervention";

export interface SandboxEvent {
  seq: number;
  worldId: string;
  round: number;
  kind: EventKind;
  actorId: string | null;
  targetId: string | null;
  content: string | null;
  payload: {
    emotion?: { label: string; intensity: number };
    private_reason?: string;
    thread_id?: number;
    mentions?: string[];
    quota_violation?: boolean;
    cancelled?: number;
    [key: string]: unknown;
  } | null;
  visibility: string;
  createdAt: string;
}

export interface RoundRecord {
  worldId: string;
  round: number;
  timeLabel: string | null;
  activeIds: string[];
  spokeIds: string[];
  silentIds: string[];
  gatedIds: string[];
  metrics: SandboxMetrics | null;
}

export interface EmergenceCard {
  type: "出圈" | "分歧" | "沉默" | "转折";
  quote: string;
  ref: number;
  why: string;
}

export interface PendingIntervention {
  seq: number;
  round: number;
  visibility: string;
  content: string;
}

export interface WorldSnapshot {
  world: WorldRecord;
  agents: AgentBeliefSummary[];
  rounds: RoundRecord[];
  metrics: (SandboxMetrics & { round: number })[];
  pendingInterventions: PendingIntervention[];
}

export const EMOJI_MOODS = ["平静", "不满", "焦虑", "愤怒", "期待"] as const;
