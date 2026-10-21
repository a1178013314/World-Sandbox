import type { AgentProfile, StancePosition } from "@ifss/shared";

export interface FeedCandidate {
  seq: number;
  round: number;
  kind: "post" | "reply" | "like" | "system" | "intervention";
  actorId: string;
  targetId: string | null;
  content: string;
  threadId: number;
  likes: number;
  replies: number;
  lastReplyRound: number | null;
  actorPosition: StancePosition;
  actorInfluence: number;
  mentionsMe: boolean;
  repliesToMe: boolean;
}

export interface FeedItem extends FeedCandidate {
  heat: number;
  relevance: number;
  score: number;
}

/** 由 (seed, agentId, seq) 派生的稳定随机数，同一三元组恒定。 */
export function deriveRandom(seed: number, agentId: string, seq: number): number {
  let hash = seed ^ 0x9e3779b9;
  for (let index = 0; index < agentId.length; index += 1) {
    hash = Math.imul(hash ^ agentId.charCodeAt(index), 0x85ebca6b);
    hash ^= hash >>> 13;
  }
  hash = Math.imul(hash ^ seq, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (const segment of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let index = 0; index < segment.length - 1; index += 1) {
      set.add(segment.slice(index, index + 2));
    }
  }
  return set;
}

/** 0.6 × 中文 bigram 重叠率 + 0.4 × 立场相反。 */
export function relevanceOf(
  profile: AgentProfile,
  content: string,
  actorPosition: StancePosition,
): number {
  const interest = bigrams(profile.stance.issue);
  const text = bigrams(content);
  let overlap = 0;
  if (interest.size > 0) {
    let hits = 0;
    for (const gram of interest) {
      if (text.has(gram)) {
        hits += 1;
      }
    }
    overlap = hits / interest.size;
  }
  const opposite =
    (profile.stance.position === "support" && actorPosition === "oppose") ||
    (profile.stance.position === "oppose" && actorPosition === "support");
  return 0.6 * overlap + 0.4 * (opposite ? 1 : 0);
}

export interface ScoreFeedInput {
  agent: AgentProfile;
  round: number;
  seed: number;
  candidates: FeedCandidate[];
  limit?: number;
}

/**
 * Feed 打分：只在候选人（本人 deliveries）里选，按 recency/heat/relevance/influence
 * 加权后取前 N 条。random 由 seed + agentId + seq 派生，回放稳定。
 */
export function scoreFeed(input: ScoreFeedInput): FeedItem[] {
  const { agent, round, seed, candidates } = input;
  const limit = input.limit ?? 8;
  const maxHeat = candidates.reduce((max, item) => Math.max(max, item.likes + 2 * item.replies), 0);

  const scored: FeedItem[] = candidates.map((item) => {
    const recency = 1 / (1 + (round - item.round));
    let heat = maxHeat === 0 ? 0 : (item.likes + 2 * item.replies) / maxHeat;
    const lastActivity = item.lastReplyRound ?? item.round;
    if (round - lastActivity >= 3) {
      heat *= 0.5;
    }
    const relevance = relevanceOf(agent, item.content, item.actorPosition);
    const random = deriveRandom(seed, agent.id, item.seq);
    const score =
      0.4 * recency + 0.22 * heat + 0.18 * relevance + 0.08 * item.actorInfluence + 0.12 * random;

    return { ...item, heat, relevance, score };
  });

  scored.sort((a, b) => b.score - a.score || b.seq - a.seq);
  return scored.slice(0, limit);
}
