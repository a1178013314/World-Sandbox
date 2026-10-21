import type { WorldSnapshot } from "@ifss/shared";
import { Link } from "react-router";
import { isBudgetPause, worldStatusLabel } from "@/features/sandbox/format";
import {
  ArrowLeftIcon,
  ForkIcon,
  PlayIcon,
  StopIcon,
  TerminalIcon,
  UsersIcon,
} from "@/features/sandbox/icons";
import { SandboxButton, Tag } from "@/features/sandbox/ui";
import type { StreamConnection } from "@/features/sandbox/use-world-stream";

export interface WorldHeaderProps {
  snapshot: WorldSnapshot;
  connection: StreamConnection;
  busy: boolean;
  onReconnect: () => void;
  onRun: (rounds: number) => void;
  onStop: () => void;
  onFork: () => void;
}

export function WorldHeader({
  snapshot,
  connection,
  busy,
  onReconnect,
  onRun,
  onStop,
  onFork,
}: WorldHeaderProps) {
  const { world } = snapshot;
  const remaining = Math.max(0, world.totalRounds - world.currentRound);
  const running = world.status === "running";
  const done = world.status === "done" || (!running && remaining === 0);
  const budget = isBudgetPause(world);
  const progress = Math.min(100, (world.currentRound / world.totalRounds) * 100);

  return (
    <header className="pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[11px] text-paper-muted transition-colors hover:text-paper"
        >
          <ArrowLeftIcon size={13} />
          世界档案
        </Link>
        <div className="flex items-center gap-1.5">
          <Link
            to={`/compare/${world.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[11px] text-paper-muted transition-colors hover:bg-ink-raised hover:text-paper"
          >
            <ForkIcon size={13} />
            对比
          </Link>
          <Link
            to={`/world/${world.id}/debug`}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[11px] text-paper-muted transition-colors hover:bg-ink-raised hover:text-paper"
          >
            <TerminalIcon size={13} />
            调试台
          </Link>
          <ConnectionBadge connection={connection} onReconnect={onReconnect} />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-4 border-b border-ink-line/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-[26px] leading-tight tracking-tight text-paper sm:text-[32px]">
              {world.title}
            </h1>
            {done ? <Tag tone="muted">回放模式</Tag> : null}
            {running ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-teal">
                <span className="live-pulse size-1.5 rounded-full bg-teal" />
                实时
              </span>
            ) : null}
            {world.parentId ? (
              <Tag tone="amber">
                <ForkIcon size={10} className="mr-1" /> 第 {world.forkRound ?? "?"} 轮分叉
              </Tag>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-paper-muted">
            <span>{world.seed.scene}</span>
            <span className="num">种子 {world.seed.text.length} 字</span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon size={12} />
              {snapshot.agents.length} 角色
            </span>
            <span className="num">
              {world.currentRound} / {world.totalRounds} 轮
            </span>
          </div>
          <details className="group mt-2 max-w-[70ch]">
            <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.16em] text-paper-muted/60 transition-colors hover:text-paper-muted">
              展开种子原文
            </summary>
            <p className="mt-2 whitespace-pre-wrap border-l border-ink-line pl-3 text-[11px] leading-6 text-paper-muted">
              {world.seed.text}
            </p>
          </details>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="w-full sm:w-64">
            <div className="mb-1.5 flex items-baseline justify-between text-[10px] text-paper-muted">
              <span>{worldStatusLabel(world)}</span>
              <span className="num">{Math.round(progress)}%</span>
            </div>
            <div className="h-[3px] w-full bg-ink-line">
              <div
                className={`h-full ${budget ? "bg-coral" : done ? "bg-paper-muted" : "bg-amber"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {running ? (
              <SandboxButton variant="danger" busy={busy} onClick={onStop}>
                <StopIcon size={13} />
                停下这一刻
              </SandboxButton>
            ) : done ? (
              <SandboxButton variant="primary" onClick={onFork}>
                <ForkIcon size={14} />
                从第 {world.currentRound} 轮分叉
              </SandboxButton>
            ) : budget ? (
              <SandboxButton variant="primary" onClick={onFork}>
                <ForkIcon size={14} />
                带上火种分叉
              </SandboxButton>
            ) : (
              <>
                <SandboxButton variant="primary" busy={busy} onClick={() => onRun(1)}>
                  <PlayIcon size={13} />
                  {world.currentRound === 0 ? "跑第 1 轮" : "再跑 1 轮"}
                </SandboxButton>
                {remaining > 1 ? (
                  <SandboxButton variant="outline" busy={busy} onClick={() => onRun(remaining)}>
                    跑完剩余 {remaining} 轮
                  </SandboxButton>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function ConnectionBadge({
  connection,
  onReconnect,
}: {
  connection: StreamConnection;
  onReconnect: () => void;
}) {
  if (connection === "offline") {
    return (
      <button
        type="button"
        onClick={onReconnect}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[11px] text-coral transition-colors hover:bg-coral/10"
      >
        <span className="size-1.5 rounded-full bg-coral" />
        已断开，点击重连
      </button>
    );
  }
  if (connection === "reconnecting" || connection === "connecting") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] text-amber">
        <span className="size-1.5 animate-pulse rounded-full bg-amber" />
        {connection === "connecting" ? "接入中" : "重新连接中"}
      </span>
    );
  }
  if (connection === "closed") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] text-paper-muted">
        <span className="size-1.5 rounded-full bg-paper-muted/50" />
        已封存
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] text-teal">
      <span className="size-1.5 rounded-full bg-teal" />
      实时
    </span>
  );
}
