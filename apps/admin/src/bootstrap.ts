import "reflect-metadata";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { readAppMeta } from "./infra/app-meta";
import { AppLoggerService } from "./logger/app-logger.service";

/**
 * 应用装配流水线：main.ts 与 e2e 共用，保证测试与生产行为一致。
 */
export async function bootstrapApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const logger = app.get(AppLoggerService);
  app.useLogger(logger);
  // 导出包含中文与 rawResponse，默认 100kb 上限会让 POST /worlds/import 直接 413。
  app.useBodyParser("json", { limit: "10mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "10mb" });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.enableShutdownHooks();

  const meta = readAppMeta();
  const swaggerConfig = new DocumentBuilder()
    .setTitle(meta.name)
    .setDescription("初始框架骨架接口文档")
    .setVersion(meta.version)
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  logger.info("admin 应用装配完成", {
    globalPrefix: "api",
    swagger: "/api/docs",
    version: meta.version,
  });

  return app;
}
