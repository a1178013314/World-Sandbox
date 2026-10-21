import type { AgentProfile, SandboxMetrics, StancePosition } from "@ifss/shared";

export interface MetricsEvent {
  seq: number;
  round: number;
  kind: "post" | "reply" | "like" | "system" | "intervention";
  actorId: string | null;
  targetId: string | null;
  content: string;
  emotion?: { label: string; intensity: number };
  mentions?: string[];
}

export interface MetricsInput {
  round: number;
  agents: AgentProfile[];
  activeIds: string[];
  silentIds: string[];
  events: MetricsEvent[];
}

const QUESTION_PATTERN = /[?？]|凭什么|为什么|多久|明细|依据|账/;

function stanceBucket(position: StancePosition): "support" | "oppose" | "neutral" {
  if (position === "support" || position === "oppose") {
    return position;
  }
  return "neutral";
}

function weightedPolarization(spokeIds: string[], profiles: Map<string, AgentProfile>): number {
  const weights = { support: 0, oppose: 0, neutral: 0 };
  for (const id of spokeIds) {
    const profile = profiles.get(id);
    if (!profile) {
      continue;
    }
    weights[stanceBucket(profile.stance.position)] += profile.influence;
  }
  const total = weights.support + weights.oppose + weights.neutral;
  if (total === 0) {
    return 0;
  }
  let entropy = 0;
  for (const weight of Object.values(weights)) {
    if (weight > 0) {
      const share = weight / total;
      entropy -= share * Math.log(share);
    }
  }
  return Math.min(1, Math.max(0, entropy / Math.log(3)));
}

function isQuestion(text: string): boolean {
  return QUESTION_PATTERN.test(text);
}

function isCounter(event: MetricsEvent, profiles: Map<string, AgentProfile>): boolean {
  if (event.kind !== "reply" || !event.actorId || !event.targetId) {
    return false;
  }
  const actor = profiles.get(event.actorId);
  const target = profiles.get(event.targetId);
  if (!actor || !target) {
    return false;
  }
  const actorBucket = stanceBucket(actor.stance.position);
  const targetBucket = stanceBucket(target.stance.position);
  return (
    (actorBucket === "support" && targetBucket === "oppose") ||
    (actorBucket === "oppose" && targetBucket === "support")
  );
}

function tensionOf(
  round: number,
  events: MetricsEvent[],
  profiles: Map<string, AgentProfile>,
): number {
  const speeches = events.filter(
    (event) => event.round === round && (event.kind === "post" || event.kind === "reply"),
  );
  if (speeches.length === 0) {
    return 0;
  }
  const hot = speeches.filter(
    (event) => isCounter(event, profiles) || isQuestion(event.content),
  ).length;
  return hot / speeches.length;
}

/** 六个指标全部为启发式，UI 必须标注；空输入一律返回 0。 */
export function computeMetrics(input: MetricsInput): SandboxMetrics {
  const profiles = new Map(input.agents.map((profile) => [profile.id, profile]));
  const speeches = input.events.filter(
    (event) => (event.kind === "post" || event.kind === "reply") && event.actorId !== null,
  );
  const spokeIds = [...new Set(speeches.map((event) => event.actorId as string))];

  let weightedIntensity = 0;
  let weightTotal = 0;
  for (const event of speeches) {
    const profile = profiles.get(event.actorId as string);
    if (!profile) {
      continue;
    }
    weightedIntensity += profile.influence * (event.emotion?.intensity ?? 0);
    weightTotal += profile.influence;
  }
  const emotionTemperature = weightTotal === 0 ? 0 : (weightedIntensity / weightTotal) * 100;

  const posts = input.events.filter((event) => event.kind === "post").length;
  const replies = input.events.filter((event) => event.kind === "reply").length;
  const mentions = input.events.reduce((sum, event) => sum + (event.mentions?.length ?? 0), 0);
  const spreadSpeed = (replies + mentions) / Math.max(1, posts);

  let opposeWeight = 0;
  let stanceWeight = 0;
  for (const id of spokeIds) {
    const profile = profiles.get(id);
    if (!profile) {
      continue;
    }
    stanceWeight += profile.influence;
    if (profile.stance.position === "oppose") {
      opposeWeight += profile.influence;
    }
  }
  const opposeShare = stanceWeight === 0 ? 0 : opposeWeight / stanceWeight;
  const avgIntensity =
    speeches.length === 0
      ? 0
      : speeches.reduce((sum, event) => sum + (event.emotion?.intensity ?? 0), 0) / speeches.length;
  const escalationIndex = Math.min(
    100,
    Math.max(
      0,
      100 * (0.4 * opposeShare + 0.3 * Math.min(1, spreadSpeed / 3) + 0.3 * avgIntensity),
    ),
  );

  const tensionRounds = [input.round - 2, input.round - 1, input.round];
  const tensionValues = tensionRounds.map((round) => tensionOf(round, input.events, profiles));
  const tension = tensionValues.reduce((sum, value) => sum + value, 0) / 3;

  const offlineRate =
    input.agents.length === 0 ? 0 : 1 - input.activeIds.length / input.agents.length;
  const silentRate =
    input.activeIds.length === 0 ? 0 : input.silentIds.length / input.activeIds.length;

  return {
    emotionTemperature,
    polarization: weightedPolarization(spokeIds, profiles),
    offlineRate,
    silentRate,
    spreadSpeed,
    escalationIndex,
    tension,
  };
}
