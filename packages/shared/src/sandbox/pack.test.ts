import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackConfigSchema } from "./pack";

describe("PackConfigSchema", () => {
  it("接受仓库内的 estate 种子包", () => {
    const raw = JSON.parse(readFileSync(join(__dirname, "../../../../packs/estate.json"), "utf8"));
    const pack = PackConfigSchema.parse(raw);

    expect(pack.id).toBe("estate");
    expect(pack.renderMode).toBe("chat");
    expect(pack.initialCast).toHaveLength(12);
    expect(pack.seed.timeSlots.length).toBeGreaterThan(0);
  });

  it("拒绝没有种子文本的包", () => {
    expect(() =>
      PackConfigSchema.parse({
        id: "x",
        name: "x",
        renderMode: "chat",
        seed: { text: "", scene: "", timeSlots: [], gateCoefficient: 1 },
        recommendedRounds: 8,
        initialCast: [],
      }),
    ).toThrow();
  });
});
