import { join } from "node:path";

export type LoggerLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerFileConfig {
  /** 是否把 JSONL 追加写入本地文件，默认关闭 */
  enabled?: boolean;
  /** 文件路径，默认 logs/<service>.log（相对进程工作目录） */
  path?: string;
}

export interface LoggerConfig {
  /** 必填：服务名，落进每条日志的 service 字段 */
  service: string;
  /** 运行环境，默认取 NODE_ENV，再退回 development */
  env?: string;
  /** 日志级别，默认取 LOG_LEVEL，再退回 info */
  level?: LoggerLevel;
  file?: LoggerFileConfig;
}

export interface ResolvedLoggerConfig {
  service: string;
  env: string;
  level: LoggerLevel;
  file: { enabled: boolean; path: string };
}

const LEVELS: readonly LoggerLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export function resolveLoggerConfig(config: LoggerConfig): ResolvedLoggerConfig {
  if (!config || typeof config.service !== "string" || config.service.trim() === "") {
    throw new Error("[@ifss/logger] createLogger 需要传入非空的 service");
  }

  const service = config.service.trim();
  const env = config.env?.trim() || process.env.NODE_ENV?.trim() || "development";
  const rawLevel = (config.level ?? process.env.LOG_LEVEL ?? "info").trim();

  if (!LEVELS.includes(rawLevel as LoggerLevel)) {
    throw new Error(`[@ifss/logger] level 非法：${rawLevel}，可选值 ${LEVELS.join(" / ")}`);
  }

  return {
    service,
    env,
    level: rawLevel as LoggerLevel,
    file: {
      enabled: config.file?.enabled ?? false,
      path: config.file?.path ?? join("logs", `${service}.log`),
    },
  };
}
