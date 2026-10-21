import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackConfigSchema } from "./pack";
import { WORLD_MIN_ROUNDS } from "./world";

describe("PackConfigSchema", () => {
  it("接受仓库内的 estate 种子包", () => {
    const raw = JSON.parse(readFileSync(join(__dirname, "../../../../packs/estate.json"), "utf8"));
    const pack = PackConfigSchema.parse(raw);

    expect(pack.id).toBe("estate");
    expect(pack.renderMode).toBe("chat");
    expect(pack.initialCast).toHaveLength(12);
    expect(pack.seed.timeSlots.length).toBeGreaterThan(0);
  });

  it("仓库内所有种子包都能通过校验，且轮次不少于下限", () => {
    const dir = join(__dirname, "../../../../packs");
    const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const pack = PackConfigSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
      const ids = pack.initialCast.map((agent) => agent.id);

      expect(pack.recommendedRounds).toBeGreaterThanOrEqual(WORLD_MIN_ROUNDS);
      expect(pack.initialCast.length).toBeGreaterThanOrEqual(6);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("拒绝没有种子文本的包", () => {
    expect(() =>
      PackConfigSchema.parse({
        id: "x",
        name: "x",
        renderMode: "chat",
        seed: { text: "", scene: "", timeSlots: [], gateCoefficient: 1 },
        recommendedRounds: 10,
        initialCast: [],
      }),
    ).toThrow();
  });
});
