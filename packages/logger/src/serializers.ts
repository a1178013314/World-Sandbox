import { getTraceId } from "./context";

export interface SerializedError {
  type: string;
  message: string;
  stack?: string;
}

/** pino 的 err 序列化器：只保留可安全落盘的三段信息 */
export function serializeError(value: unknown): SerializedError {
  if (value instanceof Error) {
    const serialized: SerializedError = { type: value.name, message: value.message };
    if (value.stack) {
      serialized.stack = value.stack;
    }
    return serialized;
  }

  if (typeof value === "string") {
    return { type: "Error", message: value };
  }

  return { type: typeof value, message: "未知错误" };
}

/** pino mixin：当前 trace 作用域存在时，给每条日志补 traceId */
export function traceMixin(): Record<string, string> {
  const traceId = getTraceId();
  return traceId ? { traceId } : {};
}

/** 对外错误信息脱敏：不暴露 stack 与自定义字段，避免泄露内部实现 */
export function sanitizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: typeof error === "string" ? error : "未知错误" };
}
