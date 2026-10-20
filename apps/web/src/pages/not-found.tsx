import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-50 text-slate-900">
      <p className="text-4xl font-semibold">404</p>
      <p className="text-sm text-slate-600">页面不存在</p>
      <Link to="/" className="text-sm text-slate-900 underline">
        返回首页
      </Link>
    </div>
  );
}
