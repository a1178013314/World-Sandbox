import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { Repository } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapApp } from "../src/bootstrap";
import { readAppMeta } from "../src/infra/app-meta";
import { AppKvEntity } from "../src/infra/database/entities/app-kv.entity";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("admin 骨架 e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health 返回 ok 且带 x-trace-id", async () => {
    const response = await request(app.getHttpServer()).get("/api/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(typeof response.body.timestamp).toBe("string");
    expect(typeof response.body.uptime).toBe("number");
    expect(response.headers["x-trace-id"]).toMatch(UUID_PATTERN);
  });

  it("沿用上游 x-trace-id", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/health")
      .set("x-trace-id", "trace-from-upstream")
      .expect(200);

    expect(response.headers["x-trace-id"]).toBe("trace-from-upstream");
  });

  it("统一错误结构（4xx）", async () => {
    const response = await request(app.getHttpServer()).get("/api/not-exists").expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      path: "/api/not-exists",
    });
    expect(response.body.message).toBeTruthy();
    expect(typeof response.body.timestamp).toBe("string");
    expect(response.headers["x-trace-id"]).toMatch(UUID_PATTERN);
  });

  it("SQLite 可写入并读回", async () => {
    const repository = app.get<Repository<AppKvEntity>>(getRepositoryToken(AppKvEntity));

    await repository.save({ key: "probe", value: "ok" });
    const saved = await repository.findOne({ where: { key: "probe" } });

    expect(saved?.value).toBe("ok");
  });

  it("Swagger 文档可访问且标题/版本与 package.json 一致", async () => {
    const meta = readAppMeta();

    const docs = await request(app.getHttpServer()).get("/api/docs-json").expect(200);

    expect(docs.body.info.title).toBe(meta.name);
    expect(docs.body.info.version).toBe(meta.version);
  });
});
