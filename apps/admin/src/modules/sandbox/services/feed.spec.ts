import type { AgentProfile } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { deriveRandom, scoreFeed } from "./feed";

const agent: AgentProfile = {
  id: "wang_ayi",
  name: "王阿姨",
  role: "退休业主",
  goals: ["阻止涨价"],
  fears: [],
  voice: "短句",
  stance: { issue: "物业费涨价", position: "oppose", intensity: 0.9 },
  influence: 0.8,
  activity: { level: 0.8, hours: [9] },
  can_see: [],
};

function candidate(seq: number, overrides: Record<string, unknown> = {}) {
  return {
    seq,
    round: 2,
    kind: "post" as const,
    actorId: "chen_jingli",
    targetId: null,
    content: "物业费涨价的通知已经发在群里",
    threadId: seq,
    likes: 0,
    replies: 0,
    lastReplyRound: null,
    actorPosition: "support" as const,
    actorInfluence: 0.7,
    mentionsMe: false,
    repliesToMe: false,
    ...overrides,
  };
}

describe("deriveRandom", () => {
  it("同一三元组恒定，不同三元组不同", () => {
    expect(deriveRandom(42, "agent", 1)).toBe(deriveRandom(42, "agent", 1));
    expect(deriveRandom(42, "agent", 1)).not.toBe(deriveRandom(42, "agent", 2));
    expect(deriveRandom(42, "agent", 1)).toBeGreaterThanOrEqual(0);
    expect(deriveRandom(42, "agent", 1)).toBeLessThan(1);
  });
});

describe("scoreFeed", () => {
  it("同 seed 两次排序完全一致", () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const first = scoreFeed({ agent, round: 3, seed: 7, candidates });
    const second = scoreFeed({ agent, round: 3, seed: 7, candidates });
    expect(first.map((item) => item.seq)).toEqual(second.map((item) => item.seq));
  });

  it("最多返回 8 条", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => candidate(index + 1));
    expect(scoreFeed({ agent, round: 3, seed: 1, candidates })).toHaveLength(8);
  });

  it("立场相反的回复获得相关性加权", () => {
    const same = scoreFeed({
      agent,
      round: 3,
      seed: 3,
      candidates: [candidate(1, { actorPosition: "oppose" })],
    })[0];
    const opposite = scoreFeed({
      agent,
      round: 3,
      seed: 3,
      candidates: [candidate(1, { actorPosition: "oppose" })],
    })[0];
    expect(same!.relevance).toBeCloseTo(opposite!.relevance, 5);
    const against = scoreFeed({
      agent,
      round: 3,
      seed: 3,
      candidates: [candidate(2, { actorPosition: "support" })],
    })[0];
    expect(against!.relevance).toBeGreaterThan(same!.relevance);
  });

  it("话题最近 3 轮无回复时 heat 减半", () => {
    const fresh = scoreFeed({
      agent,
      round: 5,
      seed: 3,
      candidates: [candidate(1, { replies: 4, lastReplyRound: 4 })],
    })[0];
    const stale = scoreFeed({
      agent,
      round: 5,
      seed: 3,
      candidates: [candidate(1, { replies: 4, lastReplyRound: 1 })],
    })[0];
    expect(stale!.heat).toBeCloseTo(fresh!.heat / 2, 5);
  });

  it("被点名或回复我时给出标记", () => {
    const items = scoreFeed({
      agent,
      round: 3,
      seed: 1,
      candidates: [candidate(1, { mentionsMe: true, repliesToMe: true })],
    });
    expect(items[0]!.mentionsMe).toBe(true);
    expect(items[0]!.repliesToMe).toBe(true);
  });
});
