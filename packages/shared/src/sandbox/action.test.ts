import { describe, expect, it } from "vitest";
import { AgentActionSchema, POST_MAX_CHARS, REPLY_MAX_CHARS } from "./action";

const base = {
  action: "post",
  text: "先把账贴出来",
  emotion: { label: "不满", intensity: 0.6 },
  private_reason: "不想交冤枉钱",
};

describe("AgentActionSchema", () => {
  it("接受合法的 post 动作", () => {
    const parsed = AgentActionSchema.parse(base);
    expect(parsed.action).toBe("post");
    expect(parsed.text).toBe("先把账贴出来");
  });

  it("拒绝带 text 的 ignore", () => {
    expect(() =>
      AgentActionSchema.parse({ ...base, action: "ignore", text: "我不想说话" }),
    ).toThrow();
  });

  it("拒绝缺少 target_id 的 reply", () => {
    expect(() => AgentActionSchema.parse({ ...base, action: "reply" })).toThrow();
  });

  it("拒绝缺少 target_id 的 like", () => {
    expect(() => AgentActionSchema.parse({ ...base, action: "like" })).toThrow();
  });

  it("超长 post 文本被截断而不是抛错", () => {
    const parsed = AgentActionSchema.parse({ ...base, text: "长".repeat(100) });
    expect(parsed.text).toHaveLength(POST_MAX_CHARS);
  });

  it("超长 reply 文本按回复上限截断", () => {
    const parsed = AgentActionSchema.parse({
      ...base,
      action: "reply",
      target_id: "agent_2",
      text: "长".repeat(80),
    });
    expect(parsed.text).toHaveLength(REPLY_MAX_CHARS);
  });

  it("缺少 emotion 时补默认值而不是拒绝", () => {
    const parsed = AgentActionSchema.parse({ ...base, emotion: undefined });
    expect(parsed.emotion).toEqual({ label: "平静", intensity: 0.3 });
  });

  it("拒绝未知动作", () => {
    expect(() => AgentActionSchema.parse({ ...base, action: "shout" })).toThrow();
  });
});
