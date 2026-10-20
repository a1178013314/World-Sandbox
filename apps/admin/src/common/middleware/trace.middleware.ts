import { getTraceId, runWithTrace } from "@ifss/logger";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
// 必须值导入：Nest 依赖 design:paramtypes，type-only import 会被编译期移除导致注入失败
import { AppLoggerService } from "../../logger/app-logger.service";

const TRACE_HEADER = "x-trace-id";

/**
 * 全链路 traceId：请求最早期建立 AsyncLocalStorage 作用域。
 * 响应头在 next() 之前写入，保证异常响应同样带 traceId。
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLoggerService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const raw = request.headers[TRACE_HEADER];
    const upstream = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;

    runWithTrace({ traceId: upstream }, () => {
      const traceId = getTraceId();
      if (traceId) {
        response.setHeader(TRACE_HEADER, traceId);
      }

      response.on("finish", () => {
        this.logger.info("请求完成", {
          method: request.method,
          url: request.originalUrl ?? request.url,
          status: response.statusCode,
          durationMs: Date.now() - startedAt,
          ...(traceId ? { traceId } : {}),
        });
      });

      next();
    });
  }
}
