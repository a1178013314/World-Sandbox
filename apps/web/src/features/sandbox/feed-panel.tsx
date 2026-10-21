import type { SandboxEvent, WorldSnapshot } from "@ifss/shared";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { firstChar, formatClock, POSITION_TONE, pct } from "./format";
import { PlayIcon, QuoteIcon } from "./icons";
import type { LiveRound } from "./stream-state";
import { SandboxButton, Tag, TypingDots } from "./ui";

function isSpeech(event: SandboxEvent): boolean {
  return event.kind === "post" || event.kind === "reply";
}

function EventLine({
  event,
  snapshot,
  onInterview,
}: {
  event: SandboxEvent;
  snapshot: WorldSnapshot;
  onInterview: (agentId: string) => void;
}) {
  const agent = snapshot.agents.find((item) => item.agentId === event.actorId);
  const target = event.targetId
    ? snapshot.agents.find((item) => item.agentId === event.targetId)
    : undefined;
  const actorName = agent?.profile.name ?? event.actorId ?? "未知角色";
  const position = agent?.profile.stance.position;

  if (event.kind === "like") {
    return (
      <div
        data-seq={event.seq}
        className="event-in flex items-center gap-2 py-1.5 pl-[44px] pr-4 text-[10px] text-paper-muted"
      >
        <span
          className={cn(
            "size-1 rounded-full",
            position ? POSITION_TONE[position] : "bg-paper-muted",
          )}
        />
        <span className="text-paper-muted">{actorName}</span>
        <span>赞同了</span>
        <span className="text-paper">{target?.profile.name ?? "一条发言"}</span>
      </div>
    );
  }

  if (event.kind === "intervention") {
    return (
      <div
        data-seq={event.seq}
        className="event-in my-2 border-y border-dashed border-amber/35 bg-amber/[0.045] px-4 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-amber">
          <span>上帝之手</span>
          <span className="text-amber/60">
            {event.visibility === "all" || event.visibility === "public"
              ? "全群公告 · 只投在场者"
              : `定向 · ${target?.profile.name ?? event.visibility}`}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-6 text-paper">{event.content}</p>
      </div>
    );
  }

  if (event.kind === "system") {
    return (
      <div
        data-seq={event.seq}
        className="event-in py-1.5 pl-[44px] pr-4 text-[10px] leading-5 text-paper-muted/70"
      >
        系统 · {event.content}
      </div>
    );
  }

  return (
    <article
      data-seq={event.seq}
      className={cn(
        "event-in",
        event.kind === "reply" ? "ml-6 border-l border-ink-line/60 pl-4 sm:ml-10" : "",
      )}
    >
      <div className="flex gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => event.actorId && onInterview(event.actorId)}
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center border border-ink-line bg-ink font-display text-[13px] text-paper-muted transition-colors hover:border-amber/50 hover:text-paper"
          aria-label={`采访 ${actorName}`}
        >
          {firstChar(actorName)}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[12px] font-medium text-paper">{actorName}</span>
            {position ? (
              <span className={cn("num text-[9px]", POSITION_TONE[position])}>
                {agent ? `${pct(agent.profile.stance.intensity)}` : ""}
              </span>
            ) : null}
            {event.kind === "reply" ? (
              <span className="text-[10px] text-paper-muted/70">
                回复 {target?.profile.name ?? "某人"}
              </span>
            ) : null}
            {event.payload?.emotion ? (
              <span className="text-[9px] text-paper-muted/60">
                {event.payload.emotion.label} {pct(event.payload.emotion.intensity)}
              </span>
            ) : null}
            {event.payload?.quota_violation ? <Tag tone="coral">超发帖配额</Tag> : null}
            <span className="num ml-auto text-[9px] text-paper-muted/40">
              #{event.seq} · {formatClock(event.createdAt)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-6 text-paper/90">
            {event.content}
          </p>
        </div>
      </div>
    </article>
  );
}

function ActiveAvatars({ ids, snapshot }: { ids: string[]; snapshot: WorldSnapshot }) {
  return (
    <span className="flex -space-x-1.5">
      {ids.slice(0, 3).map((id) => {
        const agent = snapshot.agents.find((item) => item.agentId === id);
        return (
          <span
            key={id}
            className="flex size-6 items-center justify-center rounded-full border border-ink bg-ink-raised font-display text-[10px] text-paper-muted"
          >
            {firstChar(agent?.profile.name ?? id)}
          </span>
        );
      })}
    </span>
  );
}

export function FeedPanel({
  snapshot,
  events,
  live,
  onRun,
  onInterview,
  className,
}: {
  snapshot: WorldSnapshot;
  events: SandboxEvent[];
  live: LiveRound | null;
  onRun: (rounds: number) => void;
  onInterview: (agentId: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCount = useRef(0);
  const seed = events.find((event) => event.round === 0 && event.kind === "system");
  const rounds = [
    ...new Set([
      ...snapshot.rounds.map((round) => round.round),
      ...events.filter((event) => event.round > 0).map((event) => event.round),
      ...(live ? [live.round] : []),
    ]),
  ].sort((left, right) => left - right);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (previousCount.current === 0 || distance < 220) {
      const liveRound = live?.round;
      node.scrollTo({
        top: node.scrollHeight,
        behavior: previousCount.current === 0 && liveRound === undefined ? "auto" : "smooth",
      });
    }
    previousCount.current = events.length;
  }, [events.length, live?.round]);

  const running = snapshot.world.status === "running";
  const lastRound = rounds.at(-1);

  return (
    <section className={cn("flex min-h-0 flex-col border border-ink-line bg-ink", className)}>
      <header className="flex items-center justify-between border-b border-ink-line px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-sm tracking-tight text-paper">群聊现场</h2>
          <span className="text-[10px] text-paper-muted">{snapshot.world.seed.scene}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-paper-muted">
          <span className="num">{events.filter((event) => event.round > 0).length} 条事件</span>
          {running ? (
            <span className="inline-flex items-center gap-1.5 text-teal">
              <span className="live-pulse size-1.5 rounded-full bg-teal" />
              运行中
            </span>
          ) : null}
        </div>
      </header>

      <div ref={scrollRef} className="sandbox-scroll min-h-0 flex-1 overflow-y-auto">
        {seed ? (
          <div className="border-b border-ink-line/80 bg-ink-raised/40 px-6 py-5">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-paper-muted/70">
              <QuoteIcon size={12} />
              开场种子
            </div>
            <p className="mt-2 whitespace-pre-wrap font-display text-[15px] leading-7 text-paper/90">
              {seed.content}
            </p>
            <div className="num mt-3 flex flex-wrap gap-x-4 text-[9px] text-paper-muted/60">
              <span>{snapshot.world.seed.timeSlots.join(" / ")}</span>
              <span>门系数 {snapshot.world.seed.gateCoefficient.toFixed(2)}</span>
              <span>{snapshot.world.totalRounds} 轮规划</span>
            </div>
          </div>
        ) : null}

        {rounds.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <p className="font-display text-xl text-paper">世界还没开始转动。</p>
            <p className="mt-2 max-w-[32ch] text-xs leading-6 text-paper-muted">
              种子已经投进群里。按下第一轮，看看谁先忍不住。
            </p>
            <SandboxButton variant="primary" className="mt-5" onClick={() => onRun(1)}>
              <PlayIcon size={13} />
              跑第 1 轮
            </SandboxButton>
          </div>
        ) : null}

        {rounds.map((roundNumber) => {
          const record = snapshot.rounds.find((item) => item.round === roundNumber);
          const isLive = live?.round === roundNumber;
          const roundEvents = events
            .filter((event) => event.round === roundNumber)
            .sort((left, right) => left.seq - right.seq);
          const speech = roundEvents.filter(isSpeech);
          const activeCount = record?.activeIds.length ?? (isLive ? live.activeIds.length : 0);
          const gatedCount = record?.gatedIds.length ?? (isLive ? live.gatedIds.length : 0);
          const silentCount = record?.silentIds.length ?? 0;
          const spokeIds = new Set(
            roundEvents
              .filter((event) => event.kind === "post" || event.kind === "reply")
              .map((event) => event.actorId)
              .filter((id): id is string => id !== null),
          );
          const activeIds = record?.activeIds ?? (isLive ? live.activeIds : []);
          const pendingTypers = activeIds.filter(
            (id) => !spokeIds.has(id) && !(isLive && live.gatedIds.includes(id)),
          );
          const timeLabel = record?.timeLabel;

          return (
            <section key={roundNumber} data-round={roundNumber}>
              <div className="sticky top-0 z-10 flex items-center gap-3 border-y border-ink-line/60 bg-ink/95 px-4 py-2 backdrop-blur-[1px]">
                <span className="num text-[10px] text-amber">
                  R{String(roundNumber).padStart(2, "0")}
                </span>
                {timeLabel ? (
                  <span className="num text-[10px] text-paper-muted">{timeLabel}</span>
                ) : null}
                <span className="h-px flex-1 bg-ink-line/70" />
                {isLive ? (
                  <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-teal">
                    <span className="live-pulse size-1 rounded-full bg-teal" />
                    进行中
                  </span>
                ) : (
                  <span className="num text-[9px] text-paper-muted/50">
                    {roundEvents.filter(isSpeech).length} 条发言
                  </span>
                )}
              </div>

              {roundEvents.map((event, index) => (
                <div key={event.seq} style={{ animationDelay: `${Math.min(index, 8) * 120}ms` }}>
                  <EventLine event={event} snapshot={snapshot} onInterview={onInterview} />
                </div>
              ))}

              {isLive && pendingTypers.length > 0 ? (
                <div className="flex items-center gap-2.5 px-4 py-3 text-[10px] text-teal">
                  <ActiveAvatars ids={pendingTypers} snapshot={snapshot} />
                  <TypingDots />
                  <span>{pendingTypers.length} 人正在输入…</span>
                </div>
              ) : null}

              {!isLive && speech.length === 0 ? (
                <div className="px-6 py-6">
                  <p className="font-display text-[15px] text-paper">这一轮，没有人说话。</p>
                  <p className="mt-1 text-[11px] leading-5 text-paper-muted">
                    {gatedCount > 0
                      ? `${gatedCount} 人被门拦在外面；沉默也是这一轮的结果。`
                      : "所有人都看见了，但没有人愿意先开口。"}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-line/40 px-4 py-2 text-[9px] text-paper-muted/60">
                <span className="num">{activeCount} 人在线</span>
                <span aria-hidden="true">·</span>
                <span className="num">{silentCount} 人未发言</span>
                <span aria-hidden="true">·</span>
                <span className={cn("num", gatedCount > 0 ? "text-coral/80" : "")}>
                  {gatedCount} 人被门拦
                </span>
                {record?.metrics ? (
                  <span className="num ml-auto text-paper-muted/40">
                    张 {pct(record.metrics.tension)} · 默 {pct(record.metrics.silentRate)}
                  </span>
                ) : null}
              </div>
            </section>
          );
        })}

        {rounds.length > 0 && snapshot.world.status === "ready" ? (
          <div className="border-t border-ink-line/40 px-4 py-3 text-[10px] text-paper-muted">
            {snapshot.world.currentRound >= snapshot.world.totalRounds
              ? `已到第 ${snapshot.world.totalRounds} 轮上限。要探索另一种走向，请从更早的轮次分叉。`
              : `世界停在第 ${snapshot.world.currentRound} 轮。继续推进时，会从第 ${snapshot.world.currentRound + 1} 轮开始。`}
          </div>
        ) : null}

        {lastRound !== undefined && running && live === null ? (
          <div className="flex items-center gap-2 px-4 py-3 text-[10px] text-paper-muted">
            <TypingDots />
            轮次收尾中…
          </div>
        ) : null}
      </div>
    </section>
  );
}
