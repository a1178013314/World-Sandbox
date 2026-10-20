import { describe, expect, it } from "vitest";
import { envValidationSchema } from "./env.validation";

const OPTIONS = { allowUnknown: true, abortEarly: false };

describe("envValidationSchema", () => {
  it("缺 NODE_ENV 时校验失败（fail-fast）", () => {
    const { error } = envValidationSchema.validate({}, OPTIONS);
    expect(error?.message).toMatch(/NODE_ENV/);
  });

  it("PORT 非法时校验失败", () => {
    const { error } = envValidationSchema.validate({ NODE_ENV: "test", PORT: "abc" }, OPTIONS);
    expect(error?.message).toMatch(/PORT/);
  });

  it("LOG_LEVEL 非法时校验失败", () => {
    const { error } = envValidationSchema.validate(
      { NODE_ENV: "test", LOG_LEVEL: "verbose" },
      OPTIONS,
    );
    expect(error?.message).toMatch(/LOG_LEVEL/);
  });

  it("合法环境通过并补齐默认值", () => {
    const { error, value } = envValidationSchema.validate({ NODE_ENV: "test" }, OPTIONS);
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ PORT: 3001, LOG_LEVEL: "info" });
  });
});
