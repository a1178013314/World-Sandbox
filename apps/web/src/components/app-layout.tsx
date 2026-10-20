import { Link, Outlet, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function AppLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  function handleSignOut(): void {
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            IFSS 初始骨架
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            退出登录
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
