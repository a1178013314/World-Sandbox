import { describe, expect, it } from "vitest";
import { connectionDelay } from "./use-world-stream";

describe("connectionDelay", () => {
  it("按 1s / 2s / 4s / 8s / 16s 退避", () => {
    expect([0, 1, 2, 3, 4].map(connectionDelay)).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("第五次失败后不再重连", () => {
    expect(connectionDelay(5)).toBeNull();
  });
});
