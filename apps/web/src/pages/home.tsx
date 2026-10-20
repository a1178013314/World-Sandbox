import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

export function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleCheck(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      setHealth(await apiFetch<HealthResponse>("/health"));
    } catch (caught) {
      setHealth(null);
      setError(caught instanceof ApiError ? caught.message : "请求失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">骨架概览</h1>
        <p className="text-sm text-slate-600">
          点下面的按钮会经 Vite 的 /api 代理请求 admin 的 GET /api/health，用来验证前后端连通。
        </p>
      </div>

      <Button onClick={handleCheck} disabled={pending}>
        {pending ? "请求中…" : "测试后端连通"}
      </Button>

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {health ? (
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(health, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
