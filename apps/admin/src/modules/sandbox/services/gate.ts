import type { AgentProfile, AgentState } from "@ifss/shared";

export interface GateFeedItem {
  relevance: number;
  mentionsAgent: boolean;
  repliesToAgent: boolean;
}

export interface GateInput {
  agent: { profile: AgentProfile; state: AgentState };
  feed: GateFeedItem[];
  round: number;
  gateCoefficient: number;
}

export interface GateDecision {
  p: number;
  reasons: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 规则门概率：纯函数，不读时间、不碰 DB。 */
export function speakProbability(input: GateInput): GateDecision {
  const { profile, state } = input.agent;
  const reasons: string[] = [];
  let multiplier = 1;

  const mentioned = input.feed.some((item) => item.mentionsAgent);
  const repliedTo = input.feed.some((item) => item.repliesToAgent);
  const maxRelevance = input.feed.reduce((max, item) => Math.max(max, item.relevance), 0);

  if (mentioned || repliedTo) {
    multiplier *= 1.8;
    reasons.push(mentioned ? "被点名" : "被回复");
  }
  if (maxRelevance > 0.5) {
    multiplier *= 1.4;
    reasons.push("话题涉及自身利益");
  }
  if (state.silent_rounds >= 3) {
    multiplier *= 1.2;
    reasons.push("潜水已久");
  }
  if (state.spoke_streak >= 2) {
    multiplier *= 0.5;
    reasons.push("连续发言");
  }

  const base =
    profile.activity.level * input.gateCoefficient * (1 - Math.min(state.silent_rounds, 3) * 0.1);

  return { p: clamp(base * multiplier, 0.05, 0.95), reasons };
}

export interface GateBatchResult {
  passed: string[];
  gated: string[];
  probabilities: Record<string, number>;
}

/**
 * 批量过门。通过者不足 2 人时按 p 降序补足；补进来的人仍走模型门。
 */
export function applyGate(inputs: GateInput[], random: () => number): GateBatchResult {
  const probabilities: Record<string, number> = {};
  const passed: string[] = [];
  const waiting: { id: string; p: number }[] = [];

  for (const input of inputs) {
    const { p } = speakProbability(input);
    const id = input.agent.profile.id;
    probabilities[id] = p;
    if (random() < p) {
      passed.push(id);
    } else {
      waiting.push({ id, p });
    }
  }

  if (passed.length < 2) {
    const sorted = [...waiting].sort((a, b) => b.p - a.p);
    while (passed.length < 2 && sorted.length > 0) {
      const next = sorted.shift();
      if (next) {
        passed.push(next.id);
        waiting.splice(
          waiting.findIndex((item) => item.id === next.id),
          1,
        );
      }
    }
  }

  return {
    passed,
    gated: waiting.map((item) => item.id),
    probabilities,
  };
}
