import type { AgentBeliefSummary, AgentProfile } from "@ifss/shared";
import { describe, expect, it } from "vitest";
import { buildVoiceBlock, catchphrasesOf } from "./voice";

function summary(overrides: Partial<AgentProfile> = {}): AgentBeliefSummary {
  const profile: AgentProfile = {
    id: "agent_1",
    name: "王阿姨",
    role: "退休业主",
    goals: ["先让物业贴账"],
    fears: ["被邻居觉得小题大做"],
    voice: "",
    stance: { issue: "物业费涨价", position: "oppose", intensity: 0.9 },
    influence: 0.8,
    activity: { level: 0.8, hours: [9] },
    can_see: ["本群消息"],
    ...overrides,
  };
  return {
    agentId: profile.id,
    profile,
    belief: { known: [], unknown: [], relations: {}, summary: "" },
    memory: { summary: "", recent: [] },
    state: {
      mood: { label: "平静", intensity: 0.3 },
      last_spoke_round: null,
      silent_rounds: 0,
      actions_total: 0,
      spoke_streak: 0,
    },
  };
}

describe("catchphrasesOf", () => {
  it("只取口头禅，不把称呼和禁用词当口头禅", () => {
    expect(
      catchphrasesOf("短句、爱反问，口头禅「账呢」，管年轻人叫「小姑娘」，绝不说「理解您的心情」"),
    ).toEqual(["账呢"]);
  });

  it("支持同一条口吻里的多个口头禅", () => {
    expect(catchphrasesOf("短句、玩梗，常说「等个后续」「观望」")).toEqual(["等个后续", "观望"]);
  });

  it("没有标记时兜底取引号里的短句", () => {
    expect(catchphrasesOf("偶尔冒泡，一句「啊？又交钱」")).toEqual(["啊？又交钱"]);
  });
});

describe("buildVoiceBlock", () => {
  it("立场与影响力不同，演法不同", () => {
    const strong = buildVoiceBlock(summary({ voice: "短句" }));
    expect(strong).toContain("你的话有分量");
    expect(strong).toContain("挑其中的漏洞");

    const procedural = buildVoiceBlock(
      summary({
        voice: "引法条",
        stance: { issue: "物业费涨价", position: "procedural", intensity: 0.5 },
        influence: 0.5,
        activity: { level: 0.5, hours: [9] },
      }),
    );
    expect(procedural).toContain("不评价人");
    expect(procedural).not.toContain("挑其中的漏洞");
  });

  it("中立不等于不关心，只是还没拿定主意", () => {
    const neutral = buildVoiceBlock(
      summary({
        voice: "说话留半句",
        stance: { issue: "东吴是否联刘抗曹", position: "neutral", intensity: 0.55 },
      }),
    );
    expect(neutral).toContain("还没拿定主意");
    expect(neutral).not.toContain("没那么上心");
  });
});
