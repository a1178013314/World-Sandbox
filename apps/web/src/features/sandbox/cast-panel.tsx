import type { SandboxEvent, WorldSnapshot } from "@ifss/shared";
import { cn } from "@/lib/utils";
import { agentStatus, firstChar, POSITION_LABEL, POSITION_TONE, pct } from "./format";
import type { LiveRound } from "./stream-state";

const STATUS_DOT: Record<string, string> = {
  active: "bg-teal",
  quiet: "bg-amber",
  gated: "bg-coral",
  offline: "bg-paper-muted/40",
  ready: "bg-paper/50",
};

export function CastPanel({
  snapshot,
  live,
  events,
  onInterview,
  className,
}: {
  snapshot: WorldSnapshot;
  live: LiveRound | null;
  events: SandboxEvent[];
  onInterview: (agentId: string) => void;
  className?: string;
}) {
  const ordered = [...snapshot.agents].sort(
    (left, right) =>
      right.profile.influence - left.profile.influence || left.agentId.localeCompare(right.agentId),
  );

  return (
    <section className={cn("border border-ink-line bg-ink-raised/30", className)}>
      <header className="flex items-baseline justify-between border-b border-ink-line px-3 py-2.5">
        <h2 className="font-display text-sm tracking-tight text-paper">在场名单</h2>
        <span className="num text-[10px] text-paper-muted">{snapshot.agents.length} CAST</span>
      </header>
      <div className="sandbox-scroll max-h-[calc(100dvh-260px)] overflow-y-auto">
        {ordered.map((agent) => {
          const status = agentStatus(agent.agentId, snapshot, live, events);
          const mood = agent.state.mood;
          return (
            <button
              key={agent.agentId}
              type="button"
              onClick={() => onInterview(agent.agentId)}
              className="group flex w-full items-start gap-2.5 border-b border-ink-line/50 px-3 py-2.5 text-left transition-colors hover:bg-ink-raised focus-visible:bg-ink-raised"
              title={`目标：${agent.profile.goals.join(" / ") || "未写"}｜恐惧：${
                agent.profile.fears.join(" / ") || "未写"
              }`}
            >
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-ink-line bg-ink font-display text-[15px] text-paper transition-colors group-hover:border-paper-muted/50"
                aria-hidden="true"
              >
                {firstChar(agent.profile.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-paper">
                    {agent.profile.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[9px] text-paper-muted">
                    <span className={cn("size-1.5 rounded-full", STATUS_DOT[status.tone])} />
                    {status.label}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-paper-muted/80">
                  {agent.profile.role}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span
                    className={cn("num text-[10px]", POSITION_TONE[agent.profile.stance.position])}
                  >
                    {POSITION_LABEL[agent.profile.stance.position]}
                    {pct(agent.profile.stance.intensity)}
                  </span>
                  <span className="h-[2px] flex-1 bg-ink-line">
                    <span
                      className="block h-full bg-paper-muted/60"
                      style={{ width: `${pct(agent.profile.influence)}%` }}
                    />
                  </span>
                  <span className="num text-[9px] text-paper-muted/60">
                    {pct(agent.profile.influence)}
                  </span>
                </span>
                <span className="mt-1 flex items-center justify-between gap-2 text-[9px]">
                  <span className="truncate text-paper-muted/60">
                    {mood.label} {pct(mood.intensity)}
                    {agent.state.silent_rounds > 0 ? ` · 潜水 ${agent.state.silent_rounds} 轮` : ""}
                  </span>
                  <span className="shrink-0 text-paper-muted/0 transition-colors group-hover:text-amber">
                    采访
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
