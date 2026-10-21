import type { WorldRecord } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { metricBarPercent, worldStatusLabel } from "./format";

const world: WorldRecord = {
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
  totalRounds: 8,
  status: "ready",
  errorText: null,
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
};

describe("worldStatusLabel", () => {
  it("ready 且尚未开跑时显示待开场", () => {
    expect(worldStatusLabel(world)).toBe("待开场");
  });

  it("ready 且已跑过轮次时显示待续", () => {
    expect(worldStatusLabel({ ...world, currentRound: 2 })).toBe("待续");
  });
});

describe("metricBarPercent", () => {
  it("0–100 指标不再二次放大", () => {
    expect(metricBarPercent("emotionTemperature", 62.26)).toBe(62.26);
    expect(metricBarPercent("escalationIndex", 18)).toBe(18);
  });

  it("0–1 指标换算成百分比", () => {
    expect(metricBarPercent("silentRate", 0.5)).toBe(50);
    expect(metricBarPercent("polarization", 0.63)).toBe(63);
  });

  it("越界时收在 2–100 之间", () => {
    expect(metricBarPercent("emotionTemperature", 180)).toBe(100);
    expect(metricBarPercent("silentRate", 0)).toBe(2);
  });
});
