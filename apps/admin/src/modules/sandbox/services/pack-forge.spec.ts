import { describe, expect, it } from "vitest";
import { alignActivityHours, buildPackFromModel, normalizeTimeSlots } from "./pack-forge";

const profile = (name: string) => ({
  name,
  role: "业主",
  goals: ["先弄清账目"],
  fears: ["被邻居孤立"],
  voice: "短句、爱追问，口头禅「账呢」",
  activity: { level: 0.6, hours: [9, 21] },
  can_see: ["本群消息"],
});

const modelOutput = {
  name: " 城西小区 · 物业费争议 ",
  scene: "城西小区业主群",
  seedText:
    "城西小区物业通知下月起物业费由 2.8 元涨到 3.8 元。\n【城西小区业主群】\n有人贴出通知截图，落款日期对不上。\n（业主群，说话短。）",
  timeSlots: ["早上", "09:00", "21:00"],
  gateCoefficient: 5,
  recommendedRounds: 3,
  cast: [profile("王阿姨"), profile("老陈"), profile("小林"), profile("阿杰")],
};

describe("buildPackFromModel", () => {
  it("把野结果收成合法种子包：夹紧数值、重编 id、统一议题", () => {
    const pack = buildPackFromModel(modelOutput, { castSize: 3, recommendedRounds: 12 });

    expect(pack.id).toMatch(/^gen_[0-9a-f]{8}$/);
    expect(pack.name).toBe("城西小区 · 物业费争议");
    expect(pack.seed.timeSlots).toEqual(["09:00", "21:00"]);
    expect(pack.seed.gateCoefficient).toBe(2);
    expect(pack.recommendedRounds).toBe(10);
    expect(pack.initialCast.map((agent) => agent.id)).toEqual(["agent_1", "agent_2", "agent_3"]);
    expect(new Set(pack.initialCast.map((agent) => agent.stance.issue)).size).toBe(1);
    expect(pack.initialCast[0]?.stance.issue).toBe(
      "城西小区物业通知下月起物业费由 2.8 元涨到 3.8 元".slice(0, 30),
    );
  });

  it("时段没有时钟就退回默认值，否则排班识别不到", () => {
    expect(normalizeTimeSlots(["早上", "晚上"])).toEqual(["09:00", "14:00", "21:00", "次日 08:00"]);
    expect(normalizeTimeSlots(["9:00"])).toEqual(["09:00", "14:00", "21:00", "次日 08:00"]);
    expect(normalizeTimeSlots(["9:00", "次日 08:00"])).toEqual(["9:00", "次日 08:00"]);
  });

  it("种子以【群名】版头开头时，议题取第一条实际内容", () => {
    const pack = buildPackFromModel(
      {
        ...modelOutput,
        seedText: "【城西小区业主群】\n物业通知下月物业费涨到 3.8 元。\n有人贴出截图。",
      },
      { castSize: 3, recommendedRounds: 12 },
    );
    expect(pack.initialCast[0]?.stance.issue).toBe("物业通知下月物业费涨到 3.8 元");
  });

  it("没有角色时直接抛错，不注册空包", () => {
    expect(() =>
      buildPackFromModel({ ...modelOutput, cast: [] }, { castSize: 8, recommendedRounds: 12 }),
    ).toThrow();
  });
});

describe("alignActivityHours", () => {
  const slots = ["09:00", "14:00", "21:00"];

  it("把错开的小时映射到最近的时段，避免整轮没人在线", () => {
    expect(alignActivityHours([12, 22], slots)).toEqual([14, 21]);
    expect(alignActivityHours([8, 20], slots)).toEqual([9, 21]);
  });

  it("所有人都落在同一个时段时，补足到 2 个时段", () => {
    expect(alignActivityHours([6, 7], slots)).toEqual([9, 14]);
    expect(alignActivityHours([], slots)).toEqual([9, 14]);
  });

  it("时段标签没有时钟时保持原样，最多保留 4 个小时", () => {
    expect(alignActivityHours([9, 21], ["早上", "晚上"])).toEqual([9, 21]);
    const many = alignActivityHours(
      [1, 5, 9, 13, 17, 21],
      ["01:00", "05:00", "09:00", "13:00", "17:00", "21:00"],
    );
    expect(many).toHaveLength(4);
  });
});

describe("生成包时段对齐", () => {
  it("角色在线时段与 seed.timeSlots 对得上", () => {
    const pack = buildPackFromModel(
      {
        ...modelOutput,
        timeSlots: ["09:00", "21:00"],
        cast: [
          { ...profile("夜班老陈"), activity: { level: 0.6, hours: [2, 3] } },
          { ...profile("早班小林"), activity: { level: 0.6, hours: [10, 11] } },
        ],
      },
      { castSize: 3, recommendedRounds: 12 },
    );
    const slotHours = new Set(pack.seed.timeSlots.map((slot) => Number(slot.slice(0, 2))));
    for (const agent of pack.initialCast) {
      for (const hour of agent.activity.hours) {
        expect(slotHours.has(hour)).toBe(true);
      }
    }
  });
});
