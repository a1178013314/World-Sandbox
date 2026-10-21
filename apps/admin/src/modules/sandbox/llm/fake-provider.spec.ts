import { describe, expect, it } from "vitest";
import { FakeProvider } from "./fake-provider";

describe("FakeProvider", () => {
  it("空事实占位不会写进发言", async () => {
    const provider = new FakeProvider();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { raw } = await provider.complete({
        purpose: "act",
        model: "fake",
        prompt: `[本轮新事实]\n- （无）\n[发言者]\n业主${attempt}`,
        maxTokens: 200,
        temperature: 0.7,
      });
      const parsed = JSON.parse(raw) as { action: string; text: string | null };
      if (parsed.action !== "post") {
        continue;
      }
      expect(parsed.text).toBeTruthy();
      expect(parsed.text).not.toContain("（无）");
      return;
    }
    throw new Error("假模型没有给出任何发言");
  });

  it("pack 用途返回可解析的造包 JSON", async () => {
    const provider = new FakeProvider();
    const { raw } = await provider.complete({
      purpose: "pack",
      model: "fake",
      prompt: "一句话：小区物业费从 2.8 涨到 3.8\n角色数量：6\n推荐轮次：14",
      maxTokens: 4000,
      temperature: 0.7,
    });
    const parsed = JSON.parse(raw) as {
      name: string;
      seedText: string;
      timeSlots: string[];
      recommendedRounds: number;
      cast: unknown[];
    };

    expect(parsed.name).toContain("小区物业费从 2.8 涨到 3.8");
    expect(parsed.seedText.length).toBeGreaterThan(0);
    expect(parsed.timeSlots.length).toBeGreaterThanOrEqual(2);
    expect(parsed.recommendedRounds).toBe(14);
    expect(parsed.cast).toHaveLength(6);
  });
});
