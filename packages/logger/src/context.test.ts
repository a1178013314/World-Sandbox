import { describe, expect, it } from "vitest";
import { getTraceId, runWithTrace } from "./context";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("runWithTrace", () => {
  it("无作用域时 getTraceId 返回 undefined", () => {
    expect(getTraceId()).toBeUndefined();
  });

  it("缺省生成 UUID", () => {
    const traceId = runWithTrace(() => getTraceId());
    expect(traceId).toMatch(UUID_PATTERN);
  });

  it("沿用显式传入的上游 traceId", () => {
    const traceId = runWithTrace({ traceId: "trace-upstream" }, () => getTraceId());
    expect(traceId).toBe("trace-upstream");
  });

  it("内层未传 traceId 时沿用外层作用域", () => {
    const traceId = runWithTrace({ traceId: "trace-outer" }, () =>
      runWithTrace(() => getTraceId()),
    );
    expect(traceId).toBe("trace-outer");
  });

  it("作用域结束后上下文恢复为空", () => {
    runWithTrace({ traceId: "trace-scoped" }, () => getTraceId());
    expect(getTraceId()).toBeUndefined();
  });

  it("缺少回调时抛出明确错误", () => {
    expect(() => runWithTrace({ traceId: "x" }, undefined as unknown as () => void)).toThrow(
      /runWithTrace 缺少回调函数/,
    );
  });
});
