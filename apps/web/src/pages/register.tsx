import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface RegisterResult {
  token: string;
}

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await apiFetch<RegisterResult>("/auth/register", {
        method: "POST",
        body: { email, password },
      });
      signIn(result.token);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "注册失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">注册</h1>
          <p className="text-xs text-slate-500">
            骨架期后端尚未实现鉴权接口，提交会得到 404，用于验证 /api 代理与错误结构。
          </p>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-slate-700">邮箱</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-slate-500"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-slate-700">密码</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-slate-500"
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "注册中…" : "注册"}
        </Button>

        <p className="text-center text-xs text-slate-500">
          已有账号？
          <Link to="/login" className="ml-1 text-slate-900 underline">
            去登录
          </Link>
        </p>
      </form>
    </div>
  );
}
