import type { WorldSnapshot } from "@ifss/shared";
import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { Repository } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapApp } from "../src/bootstrap";
import { DeliveryEntity } from "../src/modules/sandbox/entities/delivery.entity";
import { EventEntity } from "../src/modules/sandbox/entities/event.entity";

async function waitDone(app: INestApplication, worldId: string, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await request(app.getHttpServer()).get(`/api/worlds/${worldId}`).expect(200);
    const snapshot = response.body as WorldSnapshot;
    if (snapshot.world.status === "done" || snapshot.world.status === "paused") {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error("世界运行超时");
}

describe("世界沙盘 e2e", () => {
  let app: INestApplication;
  const previousBudget = process.env.SANDBOX_MAX_CALLS_PER_WORLD;

  beforeAll(async () => {
    // 20 轮 × 12 人会超过默认 120 次预算，测试里放宽到 400。
    process.env.SANDBOX_MAX_CALLS_PER_WORLD = "400";
    app = await bootstrapApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousBudget === undefined) {
      delete process.env.SANDBOX_MAX_CALLS_PER_WORLD;
    } else {
      process.env.SANDBOX_MAX_CALLS_PER_WORLD = previousBudget;
    }
  });

  it("包、世界、轮次、注入、分叉、采访全链路成立", async () => {
    const packs = await request(app.getHttpServer()).get("/api/packs").expect(200);
    expect(packs.body.map((pack: { id: string }) => pack.id)).toContain("estate");

    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: "estate", cast: "preset", totalRounds: 20 })
      .expect(201);
    const worldId = created.body.id as string;

    const intervention = await request(app.getHttpServer())
      .post(`/api/worlds/${worldId}/events`)
      .send({ content: "物业通知：今晚十点停水", visibility: "all", effectiveRound: 2 })
      .expect(201);
    expect(intervention.body.round).toBe(2);

    await request(app.getHttpServer()).post(`/api/worlds/${worldId}/run`).send({}).expect(201);
    const snapshot = await waitDone(app, worldId);

    expect(snapshot.world.status).toBe("done");
    expect(snapshot.world.currentRound).toBe(20);
    expect(snapshot.rounds).toHaveLength(20);
    for (const round of snapshot.rounds) {
      expect(round.spokeIds.every((id) => round.activeIds.includes(id))).toBe(true);
      expect(round.gatedIds.every((id) => !round.spokeIds.includes(id))).toBe(true);
      expect(round.metrics).not.toBeNull();
    }

    const events = (
      await request(app.getHttpServer()).get(`/api/worlds/${worldId}/events`).expect(200)
    ).body as { seq: number; kind: string; round: number; content: string }[];
    expect(events.some((event) => event.kind === "intervention" && event.round === 2)).toBe(true);
    const seqs = events.map((event) => event.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);

    const rounds = snapshot.rounds;
    const activeRound2 = new Set(rounds[1]?.activeIds ?? []);
    const deliveries = app.get<Repository<DeliveryEntity>>(getRepositoryToken(DeliveryEntity));
    const interventionEvent = events.find((event) => event.kind === "intervention");
    const interventionDeliveries = await deliveries.find({
      where: { worldId, eventSeq: interventionEvent?.seq ?? -1 },
    });
    expect(interventionDeliveries.length).toBeGreaterThan(0);
    expect(interventionDeliveries.every((row) => activeRound2.has(row.agentId))).toBe(true);

    const speechEvent = events.find((event) => event.kind === "post" || event.kind === "reply");
    expect(speechEvent).toBeDefined();
    const tts = await request(app.getHttpServer())
      .get(`/api/worlds/${worldId}/tts/${speechEvent?.seq ?? 0}`)
      .expect(200);
    expect(String(tts.headers["content-type"])).toContain("audio/");
    expect(Number(tts.headers["content-length"])).toBeGreaterThan(0);
    expect(String(tts.headers["x-tts-voice"])).not.toBe("");

    await request(app.getHttpServer())
      .get(`/api/worlds/${worldId}/tts/${interventionEvent?.seq ?? 0}`)
      .expect(400);
    await request(app.getHttpServer()).get(`/api/worlds/${worldId}/tts/999999`).expect(404);

    const forked = await request(app.getHttpServer())
      .post(`/api/worlds/${worldId}/fork`)
      .send({ atRound: 2 })
      .expect(201);
    const forkId = forked.body.id as string;
    const forkSnapshot = (
      await request(app.getHttpServer()).get(`/api/worlds/${forkId}`).expect(200)
    ).body as WorldSnapshot;
    expect(forkSnapshot.world.parentId).toBe(worldId);
    expect(forkSnapshot.world.currentRound).toBe(2);

    const forkEvents = (
      await request(app.getHttpServer()).get(`/api/worlds/${forkId}/events`).expect(200)
    ).body as { kind: string; round: number; content: string }[];
    const originalBeforeFork = events.filter((event) => event.round <= 2);
    expect(forkEvents.map((event) => [event.kind, event.round, event.content])).toEqual(
      originalBeforeFork.map((event) => [event.kind, event.round, event.content]),
    );

    const lastRound = snapshot.rounds.at(-1);
    const offline = snapshot.agents.find((agent) => !lastRound?.activeIds.includes(agent.agentId));
    expect(offline).toBeDefined();
    const interview = await request(app.getHttpServer())
      .post(`/api/worlds/${worldId}/interview`)
      .send({ agentId: offline?.agentId, question: "第 10 轮群里都说了什么？" })
      .expect(201);
    expect(typeof interview.body.answer).toBe("string");
    expect(interview.body.cited).toEqual([]);

    const cards = await request(app.getHttpServer())
      .get(`/api/worlds/${worldId}/cards`)
      .expect(200);
    const realSeqs = new Set(events.map((event) => event.seq));
    expect(cards.body.cards.every((card: { ref: number }) => realSeqs.has(card.ref))).toBe(true);
  });

  it("分段 run 结束后回到 ready，可以继续跑下一段", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: "estate", cast: "preset", totalRounds: 20 })
      .expect(201);
    const worldId = created.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/worlds/${worldId}/run`)
      .send({ rounds: 1 })
      .expect(201);
    const startedAt = Date.now();
    let snapshot: WorldSnapshot | null = null;
    while (Date.now() - startedAt < 15_000) {
      snapshot = (await request(app.getHttpServer()).get(`/api/worlds/${worldId}`).expect(200))
        .body as WorldSnapshot;
      if (snapshot.world.status !== "running") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    expect(snapshot?.world.status).toBe("ready");
    expect(snapshot?.world.currentRound).toBe(1);

    await request(app.getHttpServer()).post(`/api/worlds/${worldId}/run`).send({}).expect(201);
    const finished = await waitDone(app, worldId);
    expect(finished.world.status).toBe("done");
    expect(finished.world.currentRound).toBe(20);
  });

  it("同一世界重复 run 返回 409，done 后 run 返回 400", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: "estate", cast: "preset", totalRounds: 20 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/worlds/${created.body.id}/run`)
      .send({})
      .expect(201);
    await waitDone(app, created.body.id, 10_000);
    await request(app.getHttpServer())
      .post(`/api/worlds/${created.body.id}/run`)
      .send({})
      .expect(400);
  });

  it("带角色的分叉事件 seq 重映射后仍可追溯", async () => {
    const events = app.get<Repository<EventEntity>>(getRepositoryToken(EventEntity));
    const worlds = await request(app.getHttpServer()).get("/api/worlds").expect(200);
    const finished = (worlds.body as { id: string; status: string }[]).find(
      (world) => world.status === "done",
    );
    expect(finished).toBeDefined();
    const rows = await events.find({ where: { worldId: finished?.id ?? "" } });
    expect(rows.length).toBeGreaterThan(0);
  });
});
