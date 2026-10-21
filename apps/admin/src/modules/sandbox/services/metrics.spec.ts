import type { AgentProfile } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { computeMetrics, type MetricsInput } from "./metrics";

function profile(
  id: string,
  position: "support" | "oppose" | "neutral",
  influence = 1,
): AgentProfile {
  return {
    id,
    name: id,
    role: "业主",
    goals: [],
    fears: [],
    voice: "",
    stance: { issue: "物业费涨价", position, intensity: 0.5 },
    influence,
    activity: { level: 0.5, hours: [9] },
    can_see: [],
  };
}

const agents = [
  profile("a", "support", 1),
  profile("b", "oppose", 1),
  profile("c", "neutral", 1),
  profile("d", "neutral", 1),
];

function event(seq: number, overrides: Partial<MetricsInput["events"][number]> = {}) {
  return {
    seq,
    round: 1,
    kind: "post" as const,
    actorId: "a",
    targetId: null,
    content: "通知",
    emotion: { label: "平静", intensity: 0.2 },
    mentions: [] as string[],
    ...overrides,
  };
}

describe("computeMetrics", () => {
  it("空轮返回全零而不是抛错", () => {
    const metrics = computeMetrics({
      round: 1,
      agents,
      activeIds: [],
      silentIds: [],
      events: [],
    });
    expect(metrics).toMatchObject({
      emotionTemperature: 0,
      polarization: 0,
      offlineRate: 1,
      silentRate: 0,
      spreadSpeed: 0,
      escalationIndex: 0,
      tension: 0,
    });
  });

  it("情绪温度按影响力加权", () => {
    const metrics = computeMetrics({
      round: 1,
      agents: [profile("a", "support", 3), profile("b", "oppose", 1)],
      activeIds: ["a", "b"],
      silentIds: [],
      events: [
        event(1, { actorId: "a", emotion: { label: "愤怒", intensity: 1 } }),
        event(2, { actorId: "b", emotion: { label: "平静", intensity: 0 } }),
      ],
    });
    expect(metrics.emotionTemperature).toBeCloseTo(75, 5);
  });

  it("极化度：一边倒为 0，三方均分为 1", () => {
    const oneSided = computeMetrics({
      round: 1,
      agents,
      activeIds: ["a"],
      silentIds: [],
      events: [event(1, { actorId: "a" })],
    });
    const threeWay = computeMetrics({
      round: 1,
      agents,
      activeIds: ["a", "b", "c"],
      silentIds: [],
      events: [event(1, { actorId: "a" }), event(2, { actorId: "b" }), event(3, { actorId: "c" })],
    });
    expect(oneSided.polarization).toBeCloseTo(0, 5);
    expect(threeWay.polarization).toBeCloseTo(1, 5);
  });

  it("沉默率拆成离线率与已读不回率", () => {
    const metrics = computeMetrics({
      round: 1,
      agents,
      activeIds: ["a", "b"],
      silentIds: ["b"],
      events: [event(1)],
    });
    expect(metrics.offlineRate).toBeCloseTo(0.5, 5);
    expect(metrics.silentRate).toBeCloseTo(0.5, 5);
  });

  it("传播速度 = (回复数 + @数) / 帖子数", () => {
    const metrics = computeMetrics({
      round: 1,
      agents,
      activeIds: ["a", "b", "c"],
      silentIds: [],
      events: [
        event(1, { kind: "post" }),
        event(2, { kind: "reply", actorId: "b", targetId: "a" }),
        event(3, { kind: "reply", actorId: "c", targetId: "a", mentions: ["b"] }),
      ],
    });
    expect(metrics.spreadSpeed).toBeCloseTo(3, 5);
  });

  it("升级指数对反对占比敏感且落在 0–100", () => {
    const metrics = computeMetrics({
      round: 1,
      agents,
      activeIds: ["a", "b"],
      silentIds: [],
      events: [
        event(1, { actorId: "b", kind: "post", content: "凭什么涨价？" }),
        event(2, { actorId: "a", kind: "post", content: "理解一下" }),
      ],
    });
    expect(metrics.escalationIndex).toBeGreaterThan(0);
    expect(metrics.escalationIndex).toBeLessThanOrEqual(100);
  });

  it("张力是三段滑动平均的反驳+质问占比", () => {
    const metrics = computeMetrics({
      round: 3,
      agents,
      activeIds: ["a", "b"],
      silentIds: [],
      events: [
        event(1, { round: 1, actorId: "a", content: "通知一下" }),
        event(2, { round: 2, actorId: "b", kind: "reply", targetId: "a", content: "凭什么？" }),
        event(3, { round: 3, actorId: "b", kind: "reply", targetId: "a", content: "为什么？" }),
      ],
    });
    expect(metrics.tension).toBeGreaterThan(0);
    expect(metrics.tension).toBeLessThanOrEqual(1);
  });
});
