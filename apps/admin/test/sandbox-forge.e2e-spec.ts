import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ForgePackResult } from "@ifss/shared";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapApp } from "../src/bootstrap";

// 造包会落盘：用临时 packs 目录，别把 gen_*.json 写进仓库。
const packsDir = mkdtempSync(join(tmpdir(), "ifss-packs-"));
process.env.PACKS_DIR = packsDir;

describe("一句话生成种子包 e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(packsDir, { recursive: true, force: true });
  });

  it("没有外网也能生成包，并可立刻用它建世界", async () => {
    const forged = await request(app.getHttpServer())
      .post("/api/packs/forge")
      .send({ prompt: "小区物业费从 2.8 涨到 3.8，业主群吵起来了", castSize: 6, totalRounds: 10 })
      .expect(201);
    const result = forged.body as ForgePackResult;

    expect(result.pack.id).toMatch(/^gen_[0-9a-f]{8}$/);
    expect(result.pack.initialCast).toHaveLength(6);
    expect(result.pack.seed.timeSlots.length).toBeGreaterThanOrEqual(2);
    expect(result.pack.recommendedRounds).toBe(10);
    expect(result.searchFailed).toBe(false);
    expect(result.sources).toEqual([]);
    expect(readdirSync(join(packsDir, "generated"))).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/api/packs/${result.pack.id}`)
      .expect(200);
    expect(detail.body.name).toBe(result.pack.name);

    const list = await request(app.getHttpServer()).get("/api/packs").expect(200);
    expect(list.body.map((pack: { id: string }) => pack.id)).toContain(result.pack.id);

    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: result.pack.id, cast: "preset", totalRounds: 10 })
      .expect(201);
    const snapshot = await request(app.getHttpServer())
      .get(`/api/worlds/${created.body.id}`)
      .expect(200);
    expect(snapshot.body.world.packId).toBe(result.pack.id);
    expect(snapshot.body.agents).toHaveLength(6);
  });

  it("空输入被拦在 DTO", async () => {
    await request(app.getHttpServer()).post("/api/packs/forge").send({ prompt: "" }).expect(400);
  });
});
