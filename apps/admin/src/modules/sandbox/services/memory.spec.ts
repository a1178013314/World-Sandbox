import type { AgentBelief, AgentMemory, AgentProfile, AgentState } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { updateMemory } from "./memory";

const profile: AgentProfile = {
  id: "wang_ayi",
  name: "王阿姨",
  role: "退休业主",
  goals: [],
  fears: [],
  voice: "",
  stance: { issue: "物业费涨价", position: "oppose", intensity: 0.9 },
  influence: 0.8,
  activity: { level: 0.8, hours: [9] },
  can_see: [],
};

const other: AgentProfile = {
  ...profile,
  id: "chen_jingli",
  stance: { ...profile.stance, position: "support" },
};

function makeMemory(recent: AgentMemory["recent"] = []): AgentMemory {
  return { summary: "", recent };
}

const belief: AgentBelief = { known: [], unknown: [], relations: {}, summary: "" };
const state: AgentState = {
  mood: { label: "平静", intensity: 0.2 },
  last_spoke_round: null,
  silent_rounds: 0,
  actions_total: 0,
  spoke_streak: 0,
};

describe("updateMemory", () => {
  it("memory.recent 最多 20 条，超限丢 salience 最低者", () => {
    const recent = Array.from({ length: 20 }, (_, index) => ({
      round: 1,
      kind: "saw" as const,
      ref: index,
      gist: `旧事 ${index}`,
      salience: index === 0 ? 0.01 : 0.5,
    }));
    const result = updateMemory({
      profile,
      agents: [profile],
      belief,
      memory: makeMemory(recent),
      state,
      round: 2,
      active: true,
      spoke: false,
      seenEvents: [{ seq: 99, content: "物业贴出了涨价的明细附件", salience: 0.8 }],
    });
    expect(result.memory.recent).toHaveLength(20);
    expect(result.memory.recent.some((item) => item.ref === 99)).toBe(true);
    expect(result.memory.recent.some((item) => item.ref === 0)).toBe(false);
  });

  it("gist 取前 30 字，不调用模型", () => {
    const text = "一".repeat(50);
    const result = updateMemory({
      profile,
      agents: [profile],
      belief,
      memory: makeMemory(),
      state,
      round: 1,
      active: true,
      spoke: false,
      seenEvents: [{ seq: 1, content: text, salience: 0.5 }],
    });
    expect(result.memory.recent[0]!.gist).toHaveLength(30);
  });

  it("已读不回累加 silent_rounds，发言则清零并记录轮次", () => {
    const silent = updateMemory({
      profile,
      agents: [profile],
      belief,
      memory: makeMemory(),
      state: { ...state, silent_rounds: 2 },
      round: 3,
      active: true,
      spoke: false,
      seenEvents: [],
    });
    const spoke = updateMemory({
      profile,
      agents: [profile],
      belief,
      memory: makeMemory(),
      state: { ...state, silent_rounds: 2 },
      round: 3,
      active: true,
      spoke: true,
      seenEvents: [],
    });
    expect(silent.state.silent_rounds).toBe(3);
    expect(spoke.state.silent_rounds).toBe(0);
    expect(spoke.state.last_spoke_round).toBe(3);
    expect(spoke.state.spoke_streak).toBe(1);
  });

  it("被立场相反者回复时关系降 0.1、情绪升 0.1", () => {
    const result = updateMemory({
      profile,
      agents: [profile, other],
      belief,
      memory: makeMemory(),
      state,
      round: 2,
      active: true,
      spoke: false,
      seenEvents: [],
      incoming: [{ kind: "reply", actorId: "chen_jingli", mentionsAgent: true }],
    });
    expect(result.belief.relations.chen_jingli).toBeCloseTo(-0.1, 5);
    expect(result.state.mood.intensity).toBeCloseTo(0.35, 5);
  });

  it("被附和时关系升 0.05", () => {
    const ally: AgentProfile = {
      ...profile,
      id: "xiao_mei",
      stance: { ...profile.stance, position: "oppose" },
    };
    const result = updateMemory({
      profile,
      agents: [profile, ally],
      belief,
      memory: makeMemory(),
      state,
      round: 2,
      active: true,
      spoke: false,
      seenEvents: [],
      incoming: [{ kind: "like", actorId: "xiao_mei", mentionsAgent: false }],
    });
    expect(result.belief.relations.xiao_mei).toBeCloseTo(0.05, 5);
  });

  it("每轮情绪衰减 0.05，关系与情绪都 clamp", () => {
    const result = updateMemory({
      profile,
      agents: [profile, other],
      belief: { ...belief, relations: { chen_jingli: -0.95 } },
      memory: makeMemory(),
      state: { ...state, mood: { label: "愤怒", intensity: 1 } },
      round: 2,
      active: true,
      spoke: false,
      seenEvents: [],
      incoming: [{ kind: "reply", actorId: "chen_jingli", mentionsAgent: false }],
    });
    expect(result.belief.relations.chen_jingli).toBe(-1);
    expect(result.state.mood.intensity).toBe(1);
  });

  it("belief.known 追加首句与 ref，summary 用最近 3 条规则拼接", () => {
    const seenEvents = [
      { seq: 7, content: "物业贴了明细。附件在群文件", salience: 0.9 },
      { seq: 8, content: "电梯又坏了", salience: 0.6 },
    ];
    const result = updateMemory({
      profile,
      agents: [profile],
      belief,
      memory: makeMemory(),
      state,
      round: 2,
      active: true,
      spoke: false,
      seenEvents,
    });
    expect(result.belief.known[0]).toEqual({ fact: "物业贴了明细", ref: 7 });
    expect(result.belief.summary).toContain("物业贴了明细");
    expect(result.belief.summary).toContain("平静");
  });

  it("已知事实去重，不重复追加同一 seq", () => {
    const result = updateMemory({
      profile,
      agents: [profile],
      belief: { ...belief, known: [{ fact: "物业贴了明细", ref: 7 }] },
      memory: makeMemory(),
      state,
      round: 2,
      active: true,
      spoke: false,
      seenEvents: [{ seq: 7, content: "物业贴了明细", salience: 0.9 }],
    });
    expect(result.belief.known).toHaveLength(1);
  });

  it("离线者不更新记忆", () => {
    const result = updateMemory({
      profile,
      agents: [profile],
      belief,
      memory: makeMemory(),
      state,
      round: 2,
      active: false,
      spoke: false,
      seenEvents: [{ seq: 1, content: "不该看到的消息", salience: 0.9 }],
    });
    expect(result.memory.recent).toEqual([]);
  });
});
