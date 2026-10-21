import type { AgentProfile } from "@ifss/shared";

export interface SchedulePreviousEvent {
  round: number;
  kind: "post" | "reply" | "like" | "system" | "intervention";
  actorId: string | null;
  targetId: string | null;
  mentions: string[];
}

export interface ScheduleInput {
  agents: AgentProfile[];
  round: number;
  seed: number;
  timeSlots: string[];
  previousEvents: SchedulePreviousEvent[];
}

export interface ScheduleResult {
  activeIds: string[];
  forcedIds: string[];
  timeLabel: string;
}

function hourOf(label: string): number {
  const match = label.match(/(\d{1,2}):/);
  return match ? Number(match[1]) : 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 排班：时段过滤 → 强制上线 → 影响力排序。抽签结果由 seed + round 决定。 */
export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const timeLabel = input.timeSlots[(input.round - 1) % input.timeSlots.length] ?? "00:00";
  const hour = hourOf(timeLabel);
  const candidates = input.agents.filter((agent) => agent.activity.hours.includes(hour));

  const mentioned = new Set<string>();
  for (const event of input.previousEvents) {
    if (event.kind === "reply" && event.targetId) {
      mentioned.add(event.targetId);
    }
    for (const id of event.mentions) {
      mentioned.add(id);
    }
  }
  const forcedIds = input.agents
    .filter((agent) => mentioned.has(agent.id))
    .sort((a, b) => b.influence - a.influence)
    .slice(0, 2)
    .map((agent) => agent.id);

  const recentSpeakers = new Set<string>();
  const spokeRounds = new Map<string, Set<number>>();
  for (const event of input.previousEvents) {
    if ((event.kind === "post" || event.kind === "reply") && event.actorId) {
      recentSpeakers.add(event.actorId);
      const rounds = spokeRounds.get(event.actorId) ?? new Set<number>();
      rounds.add(event.round);
      spokeRounds.set(event.actorId, rounds);
    }
  }

  const targetCount = Math.min(6, Math.max(2, Math.round(input.agents.length * 0.35)));
  const random = mulberry32(input.seed ^ Math.imul(input.round, 0x9e3779b1));

  const pool = candidates.map((agent) => {
    const spokeTwice = (spokeRounds.get(agent.id)?.size ?? 0) >= 2;
    return { agent, weight: Math.max(0.001, agent.activity.level * (spokeTwice ? 0.5 : 1)) };
  });

  const chosen: AgentProfile[] = [];
  while (chosen.length < targetCount && pool.length > 0) {
    let totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      totalWeight = pool.length;
    }
    let ticket = random() * totalWeight;
    let index = 0;
    for (; index < pool.length; index += 1) {
      ticket -= (pool[index]?.weight ?? 1) > 0 ? (pool[index]?.weight ?? 1) : 1;
      if (ticket <= 0) {
        break;
      }
    }
    const [picked] = pool.splice(Math.min(index, pool.length - 1), 1);
    if (picked) {
      chosen.push(picked.agent);
    }
  }

  const activeIds = [...new Set([...chosen.map((agent) => agent.id), ...forcedIds])]
    .filter((id) => {
      const agent = input.agents.find((item) => item.id === id);
      return agent !== undefined;
    })
    .sort((a, b) => {
      const left = input.agents.find((agent) => agent.id === a)?.influence ?? 0;
      const right = input.agents.find((agent) => agent.id === b)?.influence ?? 0;
      return right - left;
    });

  // recentSpeakers 本轮无直接用途，保留给后续调参观察（权重已按 spokeRounds 计）。
  void recentSpeakers;

  return { activeIds, forcedIds, timeLabel };
}
