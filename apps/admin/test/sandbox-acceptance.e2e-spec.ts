import http from "node:http";
import type { AddressInfo } from "node:net";
import type { WorldSnapshot } from "@ifss/shared";
import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { Repository } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapApp } from "../src/bootstrap";
import { CallEntity } from "../src/modules/sandbox/entities/call.entity";

async function snapshotOf(app: INestApplication, worldId: string): Promise<WorldSnapshot> {
  const response = await request(app.getHttpServer()).get(`/api/worlds/${worldId}`).expect(200);
  return response.body as WorldSnapshot;
}

async function waitFor(
  app: INestApplication,
  worldId: string,
  predicate: (snapshot: WorldSnapshot) => boolean,
  timeoutMs = 30_000,
): Promise<WorldSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await snapshotOf(app, worldId);
    if (predicate(snapshot)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("等待世界状态超时");
}

/** 读取 SSE 到满足条件后再多收一小段，避免只拿到半帧。 */
function readStream(
  url: string,
  headers: Record<string, string>,
  stop: (text: string) => boolean,
  idleMs = 250,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    let settled = false;
    let stopping = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      req.destroy();
      resolve(text);
    };
    const req = http.get(url, { headers }, (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        text += chunk;
        if (!stopping && stop(text)) {
          stopping = true;
          idleTimer = setTimeout(finish, idleMs);
        }
      });
    });
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (!settled && error.code !== "ECONNRESET") {
        settled = true;
        clearTimeout(idleTimer);
        clearTimeout(hardTimer);
        reject(error);
      }
    });
    const hardTimer = setTimeout(finish, 3_000);
  });
}

describe("世界沙盘验收 e2e", () => {
  let app: INestApplication;
  let port = 0;

  beforeAll(async () => {
    app = await bootstrapApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("e2e 服务没有拿到端口");
    }
    port = (address as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  it("8 轮跑满且不超预算，门拦与在场沉默可区分", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: "estate", cast: "preset", totalRounds: 8 })
      .expect(201);
    const worldId = created.body.id as string;

    const startedAt = Date.now();
    await request(app.getHttpServer()).post(`/api/worlds/${worldId}/run`).send({}).expect(201);
    const snapshot = await waitFor(app, worldId, (current) => current.world.status === "done");
    expect(Date.now() - startedAt).toBeLessThan(120_000);

    expect(snapshot.rounds).toHaveLength(8);
    expect(snapshot.world.currentRound).toBe(8);
    const callsResponse = await request(app.getHttpServer())
      .get(`/api/worlds/${worldId}/calls`)
      .query({ pageSize: 1 })
      .expect(200);
    expect(callsResponse.body.total).toBeLessThanOrEqual(120);

    const calls = app.get<Repository<CallEntity>>(getRepositoryToken(CallEntity));
    const rows = await calls.find({ where: { worldId } });
    const calledByRound = new Map<number, Set<string>>();
    for (const row of rows) {
      if (row.round === null || row.agentId === null) {
        continue;
      }
      const ids = calledByRound.get(row.round) ?? new Set<string>();
      ids.add(row.agentId);
      calledByRound.set(row.round, ids);
    }

    let silentSeen = 0;
    let gatedSeen = 0;
    for (const round of snapshot.rounds) {
      const called = calledByRound.get(round.round) ?? new Set<string>();
      const gated = new Set(round.gatedIds);
      for (const agentId of round.gatedIds) {
        expect(called.has(agentId)).toBe(false);
      }
      for (const agentId of round.silentIds.filter((id) => !gated.has(id))) {
        expect(called.has(agentId)).toBe(true);
      }
      silentSeen += round.silentIds.length;
      gatedSeen += round.gatedIds.length;
    }
    expect(silentSeen).toBeGreaterThan(0);
    expect(gatedSeen).toBeGreaterThan(0);

    const events = (
      await request(app.getHttpServer()).get(`/api/worlds/${worldId}/events`).expect(200)
    ).body as { content: string }[];
    expect(events.some((event) => event.content.includes("（无）"))).toBe(false);
  });

  it("导出后导入可完整回放，离线采访不引用该轮", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: "estate", cast: "preset", totalRounds: 2 })
      .expect(201);
    const sourceId = created.body.id as string;
    await request(app.getHttpServer()).post(`/api/worlds/${sourceId}/run`).send({}).expect(201);
    const source = await waitFor(app, sourceId, (current) => current.world.status === "done");

    const exported = await request(app.getHttpServer())
      .get(`/api/worlds/${sourceId}/export`)
      .expect(200);
    const imported = await request(app.getHttpServer())
      .post("/api/worlds/import")
      .send(exported.body)
      .expect(201);
    const importedId = imported.body.id as string;
    const replay = await snapshotOf(app, importedId);
    expect(replay.world.status).toBe("done");
    expect(replay.world.currentRound).toBe(2);
    expect(replay.rounds).toHaveLength(2);
    expect(replay.agents).toHaveLength(source.agents.length);

    const shape = (
      rows: { round: number; kind: string; actorId: string | null; content: string }[],
    ) => rows.map((row) => [row.round, row.kind, row.actorId, row.content]);
    const [sourceEvents, importedEvents] = await Promise.all([
      request(app.getHttpServer()).get(`/api/worlds/${sourceId}/events`).expect(200),
      request(app.getHttpServer()).get(`/api/worlds/${importedId}/events`).expect(200),
    ]);
    expect(shape(importedEvents.body)).toEqual(shape(sourceEvents.body));

    const lastRound = source.rounds.at(-1);
    const offline = source.agents.find(
      (agent) => !(lastRound?.activeIds ?? []).includes(agent.agentId),
    );
    expect(offline).toBeDefined();
    const interview = await request(app.getHttpServer())
      .post(`/api/worlds/${importedId}/interview`)
      .send({ agentId: offline?.agentId, question: "第 2 轮群里都说了什么？" })
      .expect(201);
    expect(typeof interview.body.answer).toBe("string");
    expect(interview.body.cited).toEqual([]);
  });

  it("SSE 首帧是 snapshot，Last-Event-ID 之后的补发与 DB 一致", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/worlds")
      .send({ packId: "estate", cast: "preset", totalRounds: 3 })
      .expect(201);
    const worldId = created.body.id as string;
    await request(app.getHttpServer()).post(`/api/worlds/${worldId}/run`).send({}).expect(201);
    await waitFor(app, worldId, (current) => current.world.status === "done");

    const events = (
      await request(app.getHttpServer()).get(`/api/worlds/${worldId}/events`).expect(200)
    ).body as { seq: number; kind: string }[];
    const realSeqs = new Set(events.map((event) => event.seq));
    const base = `http://127.0.0.1:${port}/api/worlds/${worldId}/stream`;

    const full = await readStream(
      base,
      {},
      (text) => text.includes("event: snapshot") && text.includes("event: action"),
      500,
    );
    expect(full).toMatch(/^event: snapshot\ndata: /);
    const replayed = Array.from(full.matchAll(/^id: (\d+)$/gm), (match) => Number(match[1]));
    expect(replayed.length).toBeGreaterThan(1);
    expect(replayed.every((seq) => realSeqs.has(seq))).toBe(true);

    const cut = replayed[Math.floor(replayed.length / 2)] as number;
    const expectedReplay = replayed.filter((seq) => seq > cut);
    expect(expectedReplay.length).toBeGreaterThan(0);
    const stopAtExpected = (text: string) =>
      expectedReplay.every((seq) => text.includes(`id: ${seq}\n`));
    const idsOf = (text: string) =>
      Array.from(text.matchAll(/^id: (\d+)$/gm), (match) => Number(match[1]));

    const reconnect = await readStream(base, { "Last-Event-ID": String(cut) }, stopAtExpected, 100);
    expect(idsOf(reconnect)).toEqual(expectedReplay);

    const queryFallback = await readStream(`${base}?lastEventId=${cut}`, {}, stopAtExpected, 100);
    expect(idsOf(queryFallback)).toEqual(expectedReplay);
  });
});
