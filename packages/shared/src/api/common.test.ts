import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePageQuery } from "./common";

describe("normalizePageQuery", () => {
  it("缺省值：第 1 页、默认页大小", () => {
    expect(normalizePageQuery()).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it("非法输入回落默认值", () => {
    expect(normalizePageQuery({ page: 0, pageSize: -5 })).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
    expect(normalizePageQuery({ page: Number.NaN, pageSize: Number.POSITIVE_INFINITY })).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it("页大小封顶 MAX_PAGE_SIZE", () => {
    const result = normalizePageQuery({ page: 2, pageSize: MAX_PAGE_SIZE * 10 });
    expect(result.pageSize).toBe(MAX_PAGE_SIZE);
    expect(result.offset).toBe(MAX_PAGE_SIZE);
  });

  it("小数向下取整并计算 offset", () => {
    expect(normalizePageQuery({ page: 3.9, pageSize: 10.8 })).toEqual({
      page: 3,
      pageSize: 10,
      offset: 20,
    });
  });
});
