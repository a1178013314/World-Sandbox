import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWithTrace } from "./context";
import { createLogger } from "./logger";
import { sanitizeError, serializeError, traceMixin } from "./serializers";

const writes: string[] = [];
let restoreStdout: (() => void) | null = null;

function startCapture(): void {
  writes.length = 0;
  const impl = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as unknown as typeof process.stdout.write;
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(impl);
  restoreStdout = () => spy.mockRestore();
}

function lastJsonLine(): Record<string, unknown> {
  const line = writes
    .join("")
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("{"))
    .pop();
  if (!line) {
    throw new Error(`没有捕获到 JSONL 日志：${writes.join("")}`);
  }
  return JSON.parse(line) as Record<string, unknown>;
}

beforeEach(() => {
  startCapture();
});

afterEach(() => {
  restoreStdout?.();
  restoreStdout = null;
});

describe("createLogger", () => {
  it("service 为空时启动期直接抛错", () => {
    expect(() => createLogger({ service: "  " })).toThrow(/非空的 service/);
  });

  it("level 非法时抛错", () => {
    expect(() => createLogger({ service: "unit", level: "verbose" as never })).toThrow(
      /level 非法/,
    );
  });

  it("输出 JSONL：固定字段 + traceId 注入", () => {
    const logger = createLogger({ service: "unit", env: "test", level: "info" });
    runWithTrace({ traceId: "trace-logger" }, () => {
      logger.info("hello", { foo: 1 });
    });

    const parsed = lastJsonLine();
    expect(parsed).toMatchObject({
      service: "unit",
      env: "test",
      level: "info",
      msg: "hello",
      foo: 1,
      traceId: "trace-logger",
    });
    expect(typeof parsed.time).toBe("string");
  });

  it("error 支持 (err, msg, fields) 重载并序列化错误", () => {
    const logger = createLogger({ service: "unit", env: "test", level: "info" });
    logger.error(new TypeError("boom"), "请求失败", { scope: "unit" });

    const parsed = lastJsonLine();
    expect(parsed).toMatchObject({
      msg: "请求失败",
      scope: "unit",
      err: { type: "TypeError", message: "boom" },
    });
  });

  it("child 绑定固定字段", () => {
    const logger = createLogger({ service: "unit", env: "test", level: "info" });
    logger.child({ module: "billing" }).warn("额度不足");

    const parsed = lastJsonLine();
    expect(parsed).toMatchObject({ level: "warn", module: "billing", msg: "额度不足" });
  });
});

describe("serializers", () => {
  it("traceMixin 随上下文变化", () => {
    expect(traceMixin()).toEqual({});
    const mixin = runWithTrace({ traceId: "trace-mixin" }, () => traceMixin());
    expect(mixin).toEqual({ traceId: "trace-mixin" });
  });

  it("serializeError 兼容 Error / 字符串 / 其他", () => {
    expect(serializeError(new RangeError("bad"))).toMatchObject({
      type: "RangeError",
      message: "bad",
    });
    expect(serializeError("oops")).toEqual({ type: "Error", message: "oops" });
    expect(serializeError(42)).toEqual({ type: "number", message: "未知错误" });
  });

  it("sanitizeError 只保留 name/message", () => {
    const error = new Error("内部细节");
    error.stack = "stack-should-not-leak";
    expect(sanitizeError(error)).toEqual({ name: "Error", message: "内部细节" });
    expect(sanitizeError("plain")).toEqual({ name: "Error", message: "plain" });
  });
});
