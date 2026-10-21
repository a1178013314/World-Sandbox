import type {
  AgentProfile,
  EmergenceCard,
  PackConfig,
  PackSummary,
  SandboxEvent,
  SandboxMetrics,
  WorldRecord,
  WorldSnapshot,
} from "@ifss/shared";
import { apiFetch } from "./api";

export interface CreateWorldInput {
  packId?: string;
  seedText?: string;
  totalRounds?: number;
  cast: "preset" | AgentProfile[];
}

export interface CallLogRecord {
  id: string;
  round: number | null;
  agentId: string | null;
  purpose: string;
  promptHash: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  ok: number;
  error: string | null;
  createdAt: string;
}

export interface CallLogPage {
  items: CallLogRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CompareResult {
  worlds: [WorldRecord, WorldRecord];
  metrics: [(SandboxMetrics & { round: number })[], (SandboxMetrics & { round: number })[]];
  cards: { a: EmergenceCard; b: EmergenceCard | null }[];
}

export interface WorldExport {
  version: number;
  world: WorldRecord;
  agents: unknown[];
  events: unknown[];
  deliveries: unknown[];
  rounds: unknown[];
  calls: unknown[];
  snapshots: unknown[];
}

export const sandboxApi = {
  packs: () => apiFetch<PackSummary[]>("/packs"),
  pack: (id: string) => apiFetch<PackConfig>(`/packs/${id}`),
  previewCast: (seedText: string, castSize: number) =>
    apiFetch<AgentProfile[]>("/worlds/cast/preview", {
      method: "POST",
      body: { seedText, castSize },
    }),
  createWorld: (input: CreateWorldInput) =>
    apiFetch<{ id: string }>("/worlds", { method: "POST", body: input }),
  worlds: () => apiFetch<WorldRecord[]>("/worlds"),
  world: (id: string) => apiFetch<WorldSnapshot>(`/worlds/${id}`),
  events: (id: string, round?: number) =>
    apiFetch<SandboxEvent[]>(`/worlds/${id}/events${round === undefined ? "" : `?round=${round}`}`),
  run: (id: string, rounds?: number) =>
    apiFetch<{ endRound: number }>(`/worlds/${id}/run`, {
      method: "POST",
      body: rounds === undefined ? {} : { rounds },
    }),
  stop: (id: string) =>
    apiFetch<{ stopping: boolean }>(`/worlds/${id}/stop`, { method: "POST", body: {} }),
  inject: (id: string, input: { content: string; visibility: string; effectiveRound?: number }) =>
    apiFetch<{ seq: number; round: number }>(`/worlds/${id}/events`, {
      method: "POST",
      body: input,
    }),
  cancelInjection: (id: string, seq: number) =>
    apiFetch<{ cancelled: boolean }>(`/worlds/${id}/events/${seq}`, { method: "DELETE" }),
  fork: (id: string, atRound: number, intervention?: { content: string; visibility?: string }) =>
    apiFetch<{ id: string }>(`/worlds/${id}/fork`, {
      method: "POST",
      body: { atRound, intervention },
    }),
  interview: (id: string, agentId: string, question: string) =>
    apiFetch<{ answer: string; cited: number[] }>(`/worlds/${id}/interview`, {
      method: "POST",
      body: { agentId, question },
    }),
  cards: (id: string) => apiFetch<{ cards: EmergenceCard[] }>(`/worlds/${id}/cards`),
  compare: (id: string, other: string) => apiFetch<CompareResult>(`/worlds/${id}/compare/${other}`),
  calls: (id: string, query: { purpose?: string; page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.purpose) params.set("purpose", query.purpose);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString();
    return apiFetch<CallLogPage>(`/worlds/${id}/calls${suffix ? `?${suffix}` : ""}`);
  },
  exportWorld: (id: string) => apiFetch<WorldExport>(`/worlds/${id}/export`),
  importWorld: (payload: unknown) =>
    apiFetch<{ id: string }>("/worlds/import", { method: "POST", body: payload }),
  streamUrl: (id: string, lastEventId?: number) =>
    `/api/worlds/${id}/stream${lastEventId === undefined ? "" : `?lastEventId=${lastEventId}`}`,
};
