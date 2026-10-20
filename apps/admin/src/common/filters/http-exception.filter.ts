import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AppLoggerService } from "../../logger/app-logger.service";

export interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

interface ExceptionPayload {
  message?: string | string[];
  error?: string;
}

function normalizeHttpException(
  exception: HttpException,
  status: number,
): { message: string | string[]; error: string } {
  const fallbackError = HttpStatus[status] ?? `HTTP ${status}`;
  const payload = exception.getResponse();

  if (typeof payload === "string") {
    return { message: payload, error: fallbackError };
  }

  const body = payload as ExceptionPayload;
  const message = body.message ?? exception.message;

  return {
    message: Array.isArray(message) ? message : String(message),
    error: body.error ?? fallbackError,
  };
}

/**
 * 统一异常出口：4xx/5xx 一律返回
 * { statusCode, message, error, path, timestamp }，traceId 走响应头 x-trace-id。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const { message, error } = isHttpException
      ? normalizeHttpException(exception, status)
      : { message: "服务器内部错误", error: "Internal Server Error" };
    const path = request.originalUrl ?? request.url;

    this.logger.errorWithFields("请求异常", {
      method: request.method,
      url: path,
      status,
      errorName: exception instanceof Error ? exception.name : typeof exception,
      ...(exception instanceof Error && !isHttpException ? { stack: exception.stack } : {}),
    });

    const body: ErrorResponse = {
      statusCode: status,
      message,
      error,
      path,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}
