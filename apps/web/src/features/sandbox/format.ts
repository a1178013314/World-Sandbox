import type {
  AgentBeliefSummary,
  AgentProfile,
  SandboxEvent,
  SandboxMetrics,
  StancePosition,
  WorldRecord,
  WorldSnapshot,
} from "@ifss/shared";
import type { LiveRound } from "./stream-state";

export const POSITION_LABEL: Record<StancePosition, string> = {
  support: "支持",
  oppose: "反对",
  neutral: "中立",
  procedural: "程序",
};

export const POSITION_TONE: Record<StancePosition, string> = {
  support: "text-teal",
  oppose: "text-coral",
  neutral: "text-paper-muted",
  procedural: "text-amber",
};

export const METRIC_ROWS: { key: keyof SandboxMetrics; label: string; hint: string }[] = [
  { key: "emotionTemperature", label: "情绪温度", hint: "在场者的平均情绪强度" },
  { key: "polarization", label: "极化度", hint: "立场分布离散程度" },
  { key: "offlineRate", label: "离线率", hint: "本轮不在场的人数占比" },
  { key: "silentRate", label: "沉默率", hint: "在场但未发言的人数占比" },
  { key: "spreadSpeed", label: "扩散速度", hint: "被回复 / 提及带动的传播广度" },
  { key: "escalationIndex", label: "升级指数", hint: "含质问、反驳的发言占比" },
  { key: "tension", label: "张力", hint: "情绪、升级与极化的合成值" },
];

export function firstChar(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}`;
}

export function fixed(value: number): string {
  return value.toFixed(2);
}

/** 情绪温度与升级指数本身就是 0–100，其余指标是 0–1。 */
export function metricBarPercent(key: keyof SandboxMetrics, value: number): number {
  const scaled = key === "emotionTemperature" || key === "escalationIndex" ? value : value * 100;
  return Math.min(100, Math.max(2, scaled));
}

export function stanceText(profile: AgentProfile): string {
  return `${POSITION_LABEL[profile.stance.position]} ${pct(profile.stance.intensity)}`;
}

export function stanceIssue(profile: AgentProfile): string {
  return profile.stance.issue;
}

export function worldStatusLabel(world: WorldRecord): string {
  switch (world.status) {
    case "ready":
      return world.currentRound > 0 ? "待续" : "待开场";
    case "running":
      return "运行中";
    case "paused":
      return "已暂停";
    case "done":
      return "回放模式";
  }
}

export function isBudgetPause(world: WorldRecord): boolean {
  return world.status === "paused" && /预算|budget/i.test(world.errorText ?? "");
}

export function formatClock(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export interface AgentStatus {
  label: string;
  tone: "active" | "quiet" | "gated" | "offline" | "ready";
}

export function agentStatus(
  agentId: string,
  snapshot: WorldSnapshot,
  live: LiveRound | null,
  events: SandboxEvent[],
): AgentStatus {
  if (live) {
    if (live.gatedIds.includes(agentId)) {
      return { label: "被门拦", tone: "gated" };
    }
    if (!live.activeIds.includes(agentId)) {
      return { label: "不在场", tone: "offline" };
    }
    const spoke = events.some(
      (event) =>
        event.round === live.round &&
        event.actorId === agentId &&
        event.kind !== "like" &&
        event.kind !== "system",
    );
    return spoke ? { label: "已发言", tone: "active" } : { label: "正在输入", tone: "active" };
  }

  const latest = snapshot.rounds.at(-1);
  if (latest) {
    if (latest.gatedIds.includes(agentId)) {
      return { label: "被门拦", tone: "gated" };
    }
    if (latest.silentIds.includes(agentId)) {
      return { label: "已读不回", tone: "quiet" };
    }
    if (latest.spokeIds.includes(agentId)) {
      return { label: "活跃", tone: "active" };
    }
    return { label: "不在场", tone: "offline" };
  }

  const summary = snapshot.agents.find((item) => item.agentId === agentId);
  if (summary && summary.state.silent_rounds > 0) {
    return { label: "潜水", tone: "quiet" };
  }
  return snapshot.world.status === "ready"
    ? { label: "待入场", tone: "ready" }
    : { label: "潜水", tone: "quiet" };
}

export function agentName(
  agents: AgentBeliefSummary[],
  agentId: string | null | undefined,
): string {
  if (!agentId) {
    return "系统";
  }
  return agents.find((item) => item.agentId === agentId)?.profile.name ?? agentId;
}

export function latestMetrics(
  snapshot: WorldSnapshot,
): (SandboxMetrics & { round: number }) | null {
  return snapshot.metrics.at(-1) ?? null;
}

export function typedError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function statusTone(status: WorldRecord["status"]): string {
  switch (status) {
    case "running":
      return "text-teal";
    case "paused":
      return "text-amber";
    case "done":
      return "text-paper-muted";
    default:
      return "text-paper";
  }
}
