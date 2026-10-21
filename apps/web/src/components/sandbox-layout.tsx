import { Link, Outlet } from "react-router";
import { CompassIcon } from "@/features/sandbox/icons";

export function SandboxLayout() {
  return (
    <div className="sandbox-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-ink-line/70 bg-ink/95">
        <div className="mx-auto flex h-14 w-full max-w-[1720px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="group flex items-center gap-3 focus-visible:outline-none">
            <span className="flex size-8 items-center justify-center border border-amber/40 text-amber transition-colors group-hover:border-amber">
              <CompassIcon size={17} />
            </span>
            <span className="flex items-baseline gap-2.5">
              <span className="font-display text-[17px] tracking-tight text-paper">世界沙盘</span>
              <span className="num text-[10px] uppercase tracking-[0.28em] text-paper-muted">
                What If
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-xs text-paper-muted">
            <Link to="/" className="transition-colors hover:text-paper">
              世界档案
            </Link>
            <span className="hidden text-ink-line sm:inline">/</span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="size-1.5 rounded-full bg-amber" />
              本地沙盘
            </span>
          </nav>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
