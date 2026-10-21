import type { AgentProfile, AgentState } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { applyGate, speakProbability } from "./gate";

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "wang_ayi",
    name: "王阿姨",
    role: "退休业主",
    goals: ["阻止涨价"],
    fears: [],
    voice: "短句",
    stance: { issue: "物业费涨价", position: "oppose", intensity: 0.9 },
    influence: 0.8,
    activity: { level: 0.8, hours: [9, 14, 21] },
    can_see: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    mood: { label: "平静", intensity: 0.3 },
    last_spoke_round: null,
    silent_rounds: 0,
    actions_total: 0,
    spoke_streak: 0,
    ...overrides,
  };
}

const quietFeed = [{ relevance: 0.1, mentionsAgent: false, repliesToAgent: false }];

describe("speakProbability", () => {
  it("没有上下文加权时等于 level × 场景系数", () => {
    const result = speakProbability({
      agent: { profile: makeProfile(), state: makeState() },
      feed: quietFeed,
      round: 1,
      gateCoefficient: 1,
    });
    expect(result.p).toBeCloseTo(0.8, 5);
  });

  it("潜水轮数每多一轮衰减 10%，最多衰减 30%", () => {
    const p3 = speakProbability({
      agent: { profile: makeProfile(), state: makeState({ silent_rounds: 3 }) },
      feed: quietFeed,
      round: 4,
      gateCoefficient: 1,
    });
    const p9 = speakProbability({
      agent: { profile: makeProfile(), state: makeState({ silent_rounds: 9 }) },
      feed: quietFeed,
      round: 10,
      gateCoefficient: 1,
    });
    expect(p3.p).toBeCloseTo(0.8 * 0.7 * 1.2, 5);
    expect(p9.p).toBeCloseTo(0.8 * 0.7 * 1.2, 5);
  });

  it("被 @ 与话题相关叠加 1.8 × 1.4", () => {
    const result = speakProbability({
      agent: { profile: makeProfile(), state: makeState() },
      feed: [{ relevance: 0.7, mentionsAgent: true, repliesToAgent: false }],
      round: 2,
      gateCoefficient: 1,
    });
    expect(result.p).toBe(0.95);
  });

  it("潜水 ≥3 轮获得 1.2 倍加权，连续两轮发言则减半", () => {
    const result = speakProbability({
      agent: {
        profile: makeProfile(),
        state: makeState({ silent_rounds: 4, spoke_streak: 2 }),
      },
      feed: quietFeed,
      round: 5,
      gateCoefficient: 1,
    });
    expect(result.p).toBeCloseTo(0.8 * 0.7 * 1.2 * 0.5, 5);
  });

  it("概率被 clamp 在 [0.05, 0.95]", () => {
    const low = speakProbability({
      agent: {
        profile: makeProfile({ activity: { level: 0, hours: [9] } }),
        state: makeState(),
      },
      feed: quietFeed,
      round: 1,
      gateCoefficient: 1,
    });
    const high = speakProbability({
      agent: {
        profile: makeProfile({ activity: { level: 1, hours: [9] } }),
        state: makeState({ silent_rounds: 3 }),
      },
      feed: [{ relevance: 0.9, mentionsAgent: true, repliesToAgent: true }],
      round: 5,
      gateCoefficient: 2,
    });
    expect(low.p).toBe(0.05);
    expect(high.p).toBe(0.95);
  });
});

describe("applyGate", () => {
  const inputs = [
    {
      agent: {
        profile: makeProfile({ id: "a", influence: 0.9 }),
        state: makeState(),
      },
      feed: quietFeed,
      round: 1,
      gateCoefficient: 1,
    },
    {
      agent: {
        profile: makeProfile({ id: "b" }),
        state: makeState(),
      },
      feed: quietFeed,
      round: 1,
      gateCoefficient: 1,
    },
    {
      agent: {
        profile: makeProfile({ id: "c", activity: { level: 0.2, hours: [9] } }),
        state: makeState(),
      },
      feed: quietFeed,
      round: 1,
      gateCoefficient: 1,
    },
  ];

  it("随机数高于全部概率时按 p 降序补足两人", () => {
    const result = applyGate(inputs, () => 0.99);
    expect(result.passed).toEqual(["a", "b"]);
    expect(result.gated).toEqual(["c"]);
  });

  it("规则门不通过者进入 gated，不产生调用", () => {
    const result = applyGate(inputs, () => 0.1);
    expect(result.passed).toEqual(["a", "b", "c"]);
    expect(result.gated).toEqual([]);
  });
});
