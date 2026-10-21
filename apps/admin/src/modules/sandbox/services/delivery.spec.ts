import { describe, expect, it } from "vitest";
import { planDelivery } from "./delivery";

const activeIds = ["a", "b", "c"];

function plan(overrides: Partial<Parameters<typeof planDelivery>[0]> = {}) {
  return planDelivery({
    seq: 10,
    round: 3,
    kind: "post",
    actorId: "a",
    targetId: null,
    mentions: [],
    activeIds,
    allAgentIds: ["a", "b", "c", "d"],
    visibility: "public",
    ...overrides,
  });
}

describe("planDelivery", () => {
  it("post 投给本轮全部在场者，salience 0.5", () => {
    const result = plan();
    expect(result.deliveries.map((item) => item.agentId)).toEqual(["a", "b", "c"]);
    expect(result.deliveries.every((item) => item.salience === 0.5)).toBe(true);
    expect(result.deferred).toBe(false);
  });

  it("reply 只投给被回复者、被 @ 者与作者", () => {
    const result = plan({ kind: "reply", actorId: "a", targetId: "b", mentions: ["c"] });
    expect(result.deliveries.map((item) => item.agentId).sort()).toEqual(["a", "b", "c"]);
    expect(result.deliveries.every((item) => item.salience === 0.6)).toBe(true);
  });

  it("like 只投给目标作者，salience 0.3", () => {
    const result = plan({ kind: "like", actorId: "a", targetId: "b" });
    expect(result.deliveries).toEqual([
      { agentId: "b", eventSeq: 10, seenRound: 3, salience: 0.3 },
    ]);
  });

  it("ignore 不产生任何投递", () => {
    const result = plan({ kind: "ignore" });
    expect(result.deliveries).toEqual([]);
  });

  it("离线者零投递：post 不投给不在 activeIds 的成员", () => {
    const result = plan();
    expect(result.deliveries.some((item) => item.agentId === "d")).toBe(false);
  });

  it("公开注入只投给当轮在场者", () => {
    const result = plan({
      kind: "intervention",
      actorId: null,
      visibility: "all",
      round: 4,
    });
    expect(result.deliveries.map((item) => item.agentId)).toEqual(["a", "b", "c"]);
    expect(result.deliveries.every((item) => item.salience === 0.9)).toBe(true);
  });

  it("定向注入等目标上线才交付", () => {
    const deferred = plan({
      kind: "intervention",
      actorId: null,
      visibility: "d",
      round: 4,
    });
    expect(deferred.deliveries).toEqual([]);
    expect(deferred.deferred).toBe(true);

    const delivered = plan({
      kind: "intervention",
      actorId: null,
      visibility: "d",
      activeIds: ["a", "d"],
      round: 4,
    });
    expect(delivered.deliveries).toEqual([
      { agentId: "d", eventSeq: 10, seenRound: 4, salience: 0.9 },
    ]);
  });

  it("种子事件投给全体角色，salience 0.9", () => {
    const result = plan({ kind: "system", actorId: null, round: 0 });
    expect(result.deliveries.map((item) => item.agentId).sort()).toEqual(["a", "b", "c", "d"]);
    expect(result.deliveries.every((item) => item.salience === 0.9)).toBe(true);
  });
});
