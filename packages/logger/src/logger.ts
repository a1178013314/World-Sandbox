import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pino, { type Logger as PinoLogger } from "pino";
import { type LoggerConfig, type ResolvedLoggerConfig, resolveLoggerConfig } from "./config";
import { serializeError, traceMixin } from "./serializers";

export type LogFields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  debug(msg: string, fields?: LogFields): void;
  /** error(msg, fields) 或 error(err, msg, fields) */
  error(msg: string, fields?: LogFields): void;
  error(err: unknown, msg: string, fields?: LogFields): void;
  fatal(msg: string, fields?: LogFields): void;
  fatal(err: unknown, msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
  /** 尽力冲刷缓冲区；任何失败都吞掉，绝不向业务抛出 */
  flush(): void;
}

class PinoLoggerAdapter implements Logger {
  constructor(private readonly inner: PinoLogger) {}

  info(msg: string, fields?: LogFields): void {
    this.inner.info(fields ?? {}, msg);
  }

  warn(msg: string, fields?: LogFields): void {
    this.inner.warn(fields ?? {}, msg);
  }

  debug(msg: string, fields?: LogFields): void {
    this.inner.debug(fields ?? {}, msg);
  }

  error(errOrMsg: unknown, msgOrFields?: string | LogFields, fields?: LogFields): void {
    if (typeof msgOrFields === "string") {
      this.inner.error({ ...fields, err: errOrMsg }, msgOrFields);
      return;
    }
    this.inner.error(msgOrFields ?? {}, String(errOrMsg));
  }

  fatal(errOrMsg: unknown, msgOrFields?: string | LogFields, fields?: LogFields): void {
    if (typeof msgOrFields === "string") {
      this.inner.fatal({ ...fields, err: errOrMsg }, msgOrFields);
      return;
    }
    this.inner.fatal(msgOrFields ?? {}, String(errOrMsg));
  }

  child(bindings: LogFields): Logger {
    return new PinoLoggerAdapter(this.inner.child(bindings));
  }

  flush(): void {
    try {
      this.inner.flush();
    } catch {
      // 日志永不抛错拖垮业务
    }
  }
}

function warnToStderr(message: string): void {
  try {
    process.stderr.write(`${message}\n`);
  } catch {
    // stderr 都写不了时无处可写，直接放弃
  }
}

function createDestination(config: ResolvedLoggerConfig): pino.DestinationStream {
  if (!config.file.enabled) {
    return process.stdout;
  }

  try {
    mkdirSync(dirname(config.file.path), { recursive: true });
    const fileStream = createWriteStream(config.file.path, { flags: "a" });
    let warned = false;
    fileStream.on("error", () => {
      if (warned) {
        return;
      }
      warned = true;
      warnToStderr(`[@ifss/logger] 日志文件写入失败，已降级为仅 stdout：${config.file.path}`);
    });

    return pino.multistream([
      { level: config.level, stream: process.stdout },
      { level: config.level, stream: fileStream },
    ]);
  } catch {
    warnToStderr(`[@ifss/logger] 日志文件不可用，已降级为仅 stdout：${config.file.path}`);
    return process.stdout;
  }
}

/**
 * 创建全仓统一 logger：stdout 始终输出 JSONL；file.enabled 时追加本地文件。
 */
export function createLogger(config: LoggerConfig): Logger {
  const resolved = resolveLoggerConfig(config);

  const inner = pino(
    {
      level: resolved.level,
      base: { service: resolved.service, env: resolved.env },
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin: traceMixin,
      serializers: { err: serializeError },
    },
    createDestination(resolved),
  );

  return new PinoLoggerAdapter(inner);
}
