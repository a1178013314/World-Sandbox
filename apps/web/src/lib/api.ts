import { clearToken, getToken } from "./token";

export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
}

/** 前端统一错误：message 面向用户，traceId 用于上报后端排障 */
export class ApiError extends Error {
  readonly status: number;
  readonly traceId?: string;

  constructor(message: string, status: number, traceId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.traceId = traceId;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  /** 普通对象会被序列化为 JSON；undefined 表示无请求体 */
  body?: unknown;
}

const API_PREFIX = "/api";
const AUTH_PAGES = ["/login", "/register"];

let unauthorizedHandler: () => void = () => {
  window.location.assign("/login");
};

/** 允许测试或自定义场景替换 401 的默认跳转行为 */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

function withPrefix(path: string): string {
  if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) {
    return path;
  }
  return `${API_PREFIX}${path.startsWith("/") ? "" : "/"}${path}`;
}

function isAuthPage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const { pathname } = window.location;
  return AUTH_PAGES.some((page) => pathname.startsWith(page));
}

function readErrorMessage(text: string, status: number): string {
  if (text.trim() === "") {
    return `请求失败（${status}）`;
  }

  try {
    const body = JSON.parse(text) as ApiErrorBody;
    if (Array.isArray(body.message)) {
      const joined = body.message.filter((item) => item.trim() !== "").join("；");
      if (joined !== "") {
        return joined;
      }
    }
    if (typeof body.message === "string" && body.message.trim() !== "") {
      return body.message;
    }
  } catch {
    return text;
  }

  return `请求失败（${status}）`;
}

/**
 * 全前端唯一请求出口：
 * 自动补 /api 前缀、带 token、解析统一错误结构并携带 traceId。
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers: rawHeaders, ...rest } = options;
  const headers = new Headers(rawHeaders);
  const token = getToken();

  if (body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(withPrefix(path), {
      ...rest,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("后端服务不可达，请确认 admin 已启动", 0);
  }

  const traceId = response.headers.get("x-trace-id") ?? undefined;

  if (response.status === 401 && !isAuthPage()) {
    clearToken();
    unauthorizedHandler();
  }

  const text = await response.text();

  if (!response.ok) {
    throw new ApiError(readErrorMessage(text, response.status), response.status, traceId);
  }

  // 204 或 200 空 body 一律按 undefined 返回，避免 json() 对空体抛 SyntaxError
  if (text === "") {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
