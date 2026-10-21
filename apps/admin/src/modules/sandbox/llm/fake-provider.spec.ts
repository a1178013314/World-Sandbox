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
});
