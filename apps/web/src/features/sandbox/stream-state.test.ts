import type { SandboxStreamEvent, WorldSnapshot } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { applyStreamFrame, createStreamView, parseStreamFrame } from "./stream-state";

const snapshot: WorldSnapshot = {
  world: {
    id: "w1",
    parentId: null,
    forkRound: null,
    title: "翠湖花园",
    packId: "estate",
    seed: {
      text: "物业费上涨",
      scene: "业主群",
      timeSlots: ["09:00"],
      gateCoefficient: 1,
      renderMode: "chat",
    },
    castSource: "preset",
    rngSeed: 1,
    currentRound: 0,
    totalRounds: 3,
    status: "running",
    errorText: null,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
  },
  agents: [],
  rounds: [],
  metrics: [],
  pendingInterventions: [],
};

const action: SandboxStreamEvent = {
  type: "action",
  data: {
    seq: 7,
    round: 1,
    kind: "post",
    actorId: "wang_ayi",
    targetId: null,
    content: "先把账贴出来",
    emotion: { label: "不满", intensity: 0.7 },
  },
};

describe("parseStreamFrame", () => {
  it("从 SSE 事件名补回 type，payload 保持原始数据", () => {
    const frame = parseStreamFrame("action", JSON.stringify(action.data));
    expect(frame).toEqual(action);
  });

  it("忽略坏 JSON 与未知事件名", () => {
    expect(parseStreamFrame("action", "{oops")).toBeNull();
    expect(parseStreamFrame("ping", "{}")).toBeNull();
  });
});

describe("applyStreamFrame", () => {
  it("同一 seq 的动作只接收一次", () => {
    const once = applyStreamFrame(createStreamView(snapshot, []), action);
    const twice = applyStreamFrame(once, action);
    expect(twice.events).toHaveLength(1);
    expect(twice.events[0]?.content).toBe("先把账贴出来");
  });

  it("round_end 补齐轮次与指标，并推进当前轮", () => {
    const view = applyStreamFrame(createStreamView(snapshot, []), action);
    const ended = applyStreamFrame(view, {
      type: "round_end",
      data: {
        round: 1,
        spokeIds: ["wang_ayi"],
        silentIds: ["zhao_ge"],
        metrics: {
          emotionTemperature: 42,
          polarization: 0.5,
          offlineRate: 0.5,
          silentRate: 0.5,
          spreadSpeed: 1,
          escalationIndex: 30,
          tension: 0.2,
        },
      },
    });
    expect(ended.snapshot.world.currentRound).toBe(1);
    expect(ended.snapshot.rounds).toHaveLength(1);
    expect(ended.snapshot.metrics[0]?.emotionTemperature).toBe(42);
  });

  it("注入交付后从待生效列表移除，并在事件流里出现", () => {
    const withPending = createStreamView(
      {
        ...snapshot,
        pendingInterventions: [{ seq: 9, round: 2, visibility: "all", content: "停水" }],
      },
      [],
    );
    const delivered = applyStreamFrame(withPending, {
      type: "intervention",
      data: {
        seq: 9,
        round: 2,
        visibility: "all",
        content: "停水",
        kind: "intervention",
        actorId: null,
        targetId: null,
        delivered: true,
      },
    });
    expect(delivered.snapshot.pendingInterventions).toHaveLength(0);
    expect(delivered.events[0]?.kind).toBe("intervention");
  });

  it("回放里的未来轮次注入仍留在待生效列表，不提前进入事件流", () => {
    const withPending = createStreamView(
      {
        ...snapshot,
        pendingInterventions: [{ seq: 9, round: 3, visibility: "all", content: "停水" }],
      },
      [],
    );
    const replayed = applyStreamFrame(withPending, {
      type: "intervention",
      data: {
        seq: 9,
        round: 3,
        visibility: "all",
        content: "停水",
        kind: "intervention",
        actorId: null,
        targetId: null,
      },
    });
    expect(replayed.snapshot.pendingInterventions).toHaveLength(1);
    expect(replayed.events).toHaveLength(0);
  });
});
