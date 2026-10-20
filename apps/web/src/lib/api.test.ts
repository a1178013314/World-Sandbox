import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, setUnauthorizedHandler } from "./api";
import { clearToken, getToken, setToken } from "./token";

const fetchMock = vi.fn();

function respondWith(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function lastRequest(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined;
  if (!call) {
    throw new Error("fetch 未被调用");
  }
  return { url: call[0], init: call[1] };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearToken();
  setUnauthorizedHandler(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("自动补 /api 前缀并带 token", async () => {
    setToken("token-1");
    fetchMock.mockResolvedValue(respondWith({ status: "ok" }));

    const result = await apiFetch<{ status: string }>("/health");

    const { url, init } = lastRequest();
    expect(url).toBe("/api/health");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");
    expect(result).toEqual({ status: "ok" });
  });

  it("对象 body 自动序列化并补 content-type", async () => {
    fetchMock.mockResolvedValue(respondWith({ token: "t" }));

    await apiFetch("/auth/login", { method: "POST", body: { email: "a@b.c" } });

    const { init } = lastRequest();
    expect(init.body).toBe(JSON.stringify({ email: "a@b.c" }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("204 空响应按 undefined 返回", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiFetch("/cache")).resolves.toBeUndefined();
  });

  it("错误结构：message 数组合并 + traceId 透出", async () => {
    fetchMock.mockResolvedValue(
      respondWith(
        { statusCode: 400, message: ["邮箱已存在", "密码太短"], error: "BAD_REQUEST" },
        { status: 400, headers: { "content-type": "application/json", "x-trace-id": "trace-400" } },
      ),
    );

    const error = await apiFetch("/auth/register").then(
      () => null,
      (caught: ApiError) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error?.status).toBe(400);
    expect(error?.message).toBe("邮箱已存在；密码太短");
    expect(error?.traceId).toBe("trace-400");
  });

  it("401 清 token 并触发未授权处理（非登录页）", async () => {
    setToken("token-2");
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      respondWith({ statusCode: 401, message: "未登录" }, { status: 401 }),
    );

    await expect(apiFetch("/profile")).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("网络层失败统一提示后端不可达", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(apiFetch("/health")).rejects.toThrow(/后端服务不可达/);
  });
});
