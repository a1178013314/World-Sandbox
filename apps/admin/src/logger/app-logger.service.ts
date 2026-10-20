import { inspect } from "node:util";
import { createLogger, type LogFields, type Logger as WorkspaceLogger } from "@ifss/logger";
import { Injectable, type LoggerService, type OnApplicationShutdown } from "@nestjs/common";

/** Nest 风格的 optionalParams 约定：最后一个字符串参数是模块名 context */
function pickContext(optionalParams: unknown[]): LogFields {
  const last = optionalParams.at(-1);
  if (typeof last === "string" && last.trim() !== "") {
    return { context: last.trim() };
  }
  return {};
}

function describe(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  return inspect(message, { depth: 4, breakLength: 120 });
}

/**
 * Nest LoggerService 适配器：框架日志与业务日志统一走 workspace logger。
 * 业务侧优先使用结构化方法 info / warnWithFields / errorWithFields。
 */
@Injectable()
export class AppLoggerService implements LoggerService, OnApplicationShutdown {
  private readonly logger: WorkspaceLogger;

  constructor() {
    this.logger = createLogger({ service: "admin", file: { enabled: true } });
  }

  info(msg: string, fields?: LogFields): void {
    this.logger.info(msg, fields);
  }

  warnWithFields(msg: string, fields?: LogFields): void {
    this.logger.warn(msg, fields);
  }

  errorWithFields(msg: string, fields?: LogFields): void {
    this.logger.error(msg, fields);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(describe(message), pickContext(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    if (message instanceof Error) {
      this.logger.error(message, "框架异常", pickContext(optionalParams));
      return;
    }
    this.logger.error(describe(message), pickContext(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(describe(message), pickContext(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(describe(message), pickContext(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(describe(message), { ...pickContext(optionalParams), verbose: true });
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.fatal(describe(message), pickContext(optionalParams));
  }

  onApplicationShutdown(): void {
    this.logger.info("admin 应用已关闭，日志通道冲刷完成");
    this.logger.flush();
  }
}
