import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface TraceOptions {
  /** 上游传入的 traceId；缺省时沿用当前上下文，仍没有则生成 UUID */
  traceId?: string;
}

interface TraceStore {
  traceId: string;
}

const storage = new AsyncLocalStorage<TraceStore>();

/**
 * 建立 traceId 作用域。
 * 支持 runWithTrace(fn) 与 runWithTrace({ traceId }, fn) 两种写法。
 */
export function runWithTrace<T>(fn: () => T): T;
export function runWithTrace<T>(options: TraceOptions, fn: () => T): T;
export function runWithTrace<T>(optionsOrFn: TraceOptions | (() => T), maybeFn?: () => T): T {
  const options = typeof optionsOrFn === "function" ? {} : optionsOrFn;
  const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;

  if (!fn) {
    throw new TypeError("[@ifss/logger] runWithTrace 缺少回调函数");
  }

  const upstream = options.traceId?.trim();
  const traceId = upstream || getTraceId() || randomUUID();

  return storage.run({ traceId }, fn);
}

/** 读取当前上下文 traceId；不在任何 trace 作用域内时返回 undefined */
export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}
