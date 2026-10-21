import type { EmergenceCard } from "@ifss/shared";
import { cn } from "@/lib/utils";
import { QuoteIcon, RefreshIcon } from "./icons";
import { ErrorBanner, Spinner } from "./ui";

const TYPE_TONE: Record<EmergenceCard["type"], string> = {
  出圈: "text-teal",
  分歧: "text-coral",
  沉默: "text-paper-muted",
  转折: "text-amber",
};

export function EmergenceBar({
  cards,
  loading,
  error,
  onRefresh,
  onJump,
  className,
}: {
  cards: EmergenceCard[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onJump: (seq: number) => void;
  className?: string;
}) {
  return (
    <section className={cn("border border-ink-line bg-ink-raised/20", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-line px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-sm tracking-tight text-paper">名场面</h2>
          <span className="text-[10px] text-paper-muted/60">
            从已发生的事件里挑三帧，不预告结局
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[10px] text-paper-muted transition-colors hover:text-paper disabled:opacity-40"
        >
          {loading ? <Spinner className="size-3" /> : <RefreshIcon size={12} />}
          {cards.length > 0 ? "重新整理" : "整理名场面"}
        </button>
      </header>
      {error ? (
        <div className="p-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      <div className="grid divide-y divide-ink-line/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {cards.length > 0
          ? cards.map((card) => (
              <button
                key={`${card.type}-${card.ref}`}
                type="button"
                onClick={() => onJump(card.ref)}
                className="group flex flex-col items-start gap-2 px-4 py-4 text-left transition-colors hover:bg-ink-raised/60"
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={cn("text-[9px] uppercase tracking-[0.2em]", TYPE_TONE[card.type])}
                  >
                    {card.type}
                  </span>
                  <span className="num text-[9px] text-paper-muted/40 group-hover:text-amber">
                    #{card.ref}
                  </span>
                </div>
                <p className="font-display text-[15px] leading-6 text-paper">“{card.quote}”</p>
                <p className="text-[10px] leading-5 text-paper-muted">{card.why}</p>
              </button>
            ))
          : !loading && (
              <div className="flex items-center gap-2 px-4 py-5 text-[11px] text-paper-muted sm:col-span-3">
                <QuoteIcon size={14} className="text-paper-muted/50" />
                跑过几轮后，这里会留下三帧值得回看的话。也可以在任意时刻手动整理。
              </div>
            )}
        {loading && cards.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[11px] text-paper-muted sm:col-span-3">
            <Spinner className="size-3" />
            正在从事件里寻找可以被引用的瞬间…
          </div>
        ) : null}
      </div>
    </section>
  );
}
