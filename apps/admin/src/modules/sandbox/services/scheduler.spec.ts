import type { AgentProfile } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { buildSchedule } from "./scheduler";

function agent(id: string, hours: number[], level = 0.6, influence = 0.5): AgentProfile {
  return {
    id,
    name: id,
    role: "业主",
    goals: [],
    fears: [],
    voice: "",
    stance: { issue: "物业费涨价", position: "neutral", intensity: 0.3 },
    influence,
    activity: { level, hours },
    can_see: [],
  };
}

const agents = Array.from({ length: 12 }, (_, index) =>
  agent(`agent_${index + 1}`, [9, 14, 21], 0.6, 0.1 * (index + 1)),
);

describe("buildSchedule", () => {
  it("目标人数 clamp 在 [2, 6]", () => {
    const few = buildSchedule({
      agents: agents.slice(0, 2),
      round: 1,
      seed: 1,
      timeSlots: ["09:00"],
      previousEvents: [],
    });
    const many = buildSchedule({
      agents: Array.from({ length: 20 }, (_, index) => agent(`a${index}`, [9])),
      round: 1,
      seed: 1,
      timeSlots: ["09:00"],
      previousEvents: [],
    });
    expect(few.activeIds.length).toBeLessThanOrEqual(2);
    expect(many.activeIds.length).toBe(6);
  });

  it("按种子时段过滤 hours 不匹配的角色", () => {
    const nightOnly = [agent("night", [21]), agent("day", [9])];
    const result = buildSchedule({
      agents: nightOnly,
      round: 1,
      seed: 1,
      timeSlots: ["09:00", "21:00"],
      previousEvents: [],
    });
    expect(result.activeIds).toContain("day");
    expect(result.activeIds).not.toContain("night");
    expect(result.timeLabel).toBe("09:00");
  });

  it("上轮被 @ 或被回复者强制上线，最多 2 人且无视 hours", () => {
    const cast = [
      agent("a", [9], 0.1, 0.3),
      agent("b", [9], 0.1, 0.6),
      agent("c", [9], 0.1, 0.9),
      agent("night", [21], 0.1, 0.95),
    ];
    const result = buildSchedule({
      agents: cast,
      round: 2,
      seed: 1,
      timeSlots: ["21:00"],
      previousEvents: [
        { round: 1, kind: "reply", actorId: "a", targetId: "night", mentions: [] },
        { round: 1, kind: "post", actorId: "b", targetId: null, mentions: ["night", "a"] },
      ],
    });
    expect(result.activeIds).toContain("night");
    expect(result.activeIds).toContain("a");
    expect(result.forcedIds).toHaveLength(2);
  });

  it("同 seed 与轮次可复现", () => {
    const first = buildSchedule({
      agents,
      round: 2,
      seed: 9,
      timeSlots: ["14:00"],
      previousEvents: [],
    });
    const second = buildSchedule({
      agents,
      round: 2,
      seed: 9,
      timeSlots: ["14:00"],
      previousEvents: [],
    });
    expect(first.activeIds).toEqual(second.activeIds);
  });

  it("输出按影响力降序", () => {
    const result = buildSchedule({
      agents,
      round: 1,
      seed: 3,
      timeSlots: ["09:00"],
      previousEvents: [],
    });
    const influences = result.activeIds.map(
      (id) => agents.find((item) => item.id === id)?.influence ?? 0,
    );
    expect(influences).toEqual([...influences].sort((a, b) => b - a));
  });

  it("时段无人在线时返回空排班而不是报错", () => {
    const result = buildSchedule({
      agents: [agent("day", [9])],
      round: 1,
      seed: 1,
      timeSlots: ["21:00"],
      previousEvents: [],
    });
    expect(result.activeIds).toEqual([]);
  });
});
