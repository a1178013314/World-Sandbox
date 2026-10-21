import type { WorldSnapshot } from "@ifss/shared";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapApp } from "../src/bootstrap";

describe("调用预算闸门", () => {
  let app: INestApplication;
  const previous = process.env.SANDBOX_MAX_CALLS_PER_WORLD;

  beforeAll(async () => {
    process.env.SANDBOX_MAX_CALLS_PER_WORLD = "1";
    app = await bootstrapApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previous === undefined) {
      delete process.env.SANDBOX_MAX_CALLS_PER_WORLD;
    } else {
      process.env.SANDBOX_MAX_CALLS_PER_WORLD = previous;
    }
  });

  it("超过上限时停轮并写入 error_text", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: "estate", cast: "preset", totalRounds: 10 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/worlds/${created.body.id}/run`)
      .send({})
      .expect(201);

    const startedAt = Date.now();
    let snapshot: WorldSnapshot | null = null;
    while (Date.now() - startedAt < 10_000) {
      snapshot = (
        await request(app.getHttpServer()).get(`/api/worlds/${created.body.id}`).expect(200)
      ).body as WorldSnapshot;
      if (snapshot.world.status === "paused") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(snapshot?.world.status).toBe("paused");
    expect(snapshot?.world.errorText).toContain("预算");
  });
});
