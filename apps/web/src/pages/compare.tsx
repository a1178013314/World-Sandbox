import type { WorldRecord } from "@ifss/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  fixed,
  formatDate,
  metricBarPercent,
  statusTone,
  truncate,
  typedError,
  worldStatusLabel,
} from "@/features/sandbox/format";
import { ArrowLeftIcon, ArrowUpRightIcon, ForkIcon } from "@/features/sandbox/icons";
import { ErrorBanner, SandboxButton, Spinner, Tag } from "@/features/sandbox/ui";
import type { CompareResult } from "@/lib/sandbox-api";
import { sandboxApi } from "@/lib/sandbox-api";

const COMPARE_METRICS = [
  { key: "emotionTemperature", label: "情绪温度", hint: "在场者平均情绪强度" },
  { key: "silentRate", label: "沉默率", hint: "在场但未发言" },
  { key: "escalationIndex", label: "升级指数", hint: "质问与反驳占比" },
  { key: "polarization", label: "极化度", hint: "立场分歧程度" },
] as const;

function WorldColumn({ world, side }: { world: WorldRecord; side: "A" | "B" }) {
  return (
    <Link
      to={`/world/${world.id}`}
      className="group flex min-w-0 flex-1 items-start gap-3 border border-ink-line px-4 py-3 transition-colors hover:bg-ink-raised/60"
    >
      <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center border border-ink-line text-[10px] text-amber">
        {side}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate font-display text-lg tracking-tight text-paper">
            {world.title}
          </span>
          <span
            className={`num text-[9px] uppercase tracking-[0.14em] ${statusTone(world.status)}`}
          >
            {worldStatusLabel(world)}
          </span>
        </span>
        <span className="mt-1 block text-[10px] text-paper-muted">
          {world.seed.scene} · 创建于 {formatDate(world.createdAt)}
        </span>
        <span className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-paper-muted">
          <span>
            分叉轮 <span className="text-paper">{world.forkRound ?? "原创"}</span>
          </span>
          <span>
            当前轮 <span className="text-paper">{world.currentRound}</span> / {world.totalRounds}
          </span>
          <span className="text-paper-muted/60">{world.packId}</span>
        </span>
        <span className="mt-1 block truncate text-[10px] text-paper-muted/60">
          {truncate(world.seed.text.replace(/\s+/g, " "), 64)}
        </span>
      </span>
      <ArrowUpRightIcon
        size={14}
        className="mt-1 shrink-0 text-paper-muted/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-amber"
      />
    </Link>
  );
}

export function ComparePage() {
  const { a, b } = useParams();
  const [worlds, setWorlds] = useState<WorldRecord[] | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!a) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    setWorlds(null);
    if (b) {
      sandboxApi
        .compare(a, b)
        .then((value) => {
          if (!cancelled) setResult(value);
        })
        .catch((caught: unknown) => {
          if (!cancelled) setError(typedError(caught));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      sandboxApi
        .worlds()
        .then((rows) => {
          if (!cancelled) {
            setWorlds(rows);
            setLoading(false);
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setError(typedError(caught));
            setWorlds([]);
            setLoading(false);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [a, b]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-24 text-xs text-paper-muted">
        <Spinner className="size-4 text-amber" />
        {b ? "正在把两个世界并排展开…" : "正在读取可比对的世界…"}
      </div>
    );
  }

  if (!b) {
    const source = worlds?.find((world) => world.id === a);
    const others = worlds?.filter((world) => world.id !== a) ?? [];
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] text-paper-muted">
          <ArrowLeftIcon size={13} /> 世界档案
        </Link>
        <h1 className="mt-3 font-display text-3xl tracking-tight text-paper">选择另一个世界</h1>
        <p className="mt-2 max-w-[52ch] text-xs leading-6 text-paper-muted">
          {source ? (
            <>
              以「{source.title}」为 A 侧。选一个世界作为 B
              侧，只比较最后一轮的四项指标与三组名场面。
            </>
          ) : (
            "选择要并排查看的两个世界。"
          )}
        </p>
        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
        <div className="mt-6 border-t border-ink-line">
          {others.map((world) => (
            <Link
              key={world.id}
              to={`/compare/${a}/${world.id}`}
              className="group flex items-center justify-between gap-4 border-b border-ink-line/60 px-3 py-4 transition-colors hover:bg-ink-raised/60"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-lg text-paper">{world.title}</span>
                  {world.parentId ? (
                    <Tag tone="amber">
                      <ForkIcon size={10} className="mr-1" /> 第 {world.forkRound} 轮分叉
                    </Tag>
                  ) : null}
                  <span className={`num text-[9px] ${statusTone(world.status)}`}>
                    {worldStatusLabel(world)}
                  </span>
                </span>
                <span className="num mt-1 block text-[10px] text-paper-muted">
                  {world.currentRound} / {world.totalRounds} 轮 · {formatDate(world.createdAt)}
                </span>
              </span>
              <span className="text-[10px] text-paper-muted transition-colors group-hover:text-amber">
                作为 B 侧对比
              </span>
            </Link>
          ))}
          {others.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-display text-lg text-paper">还没有可以对比的另一个世界。</p>
              <p className="mt-1 text-xs text-paper-muted">
                回到世界页分叉一次，就能把两条走向并排看。
              </p>
              <Link to="/" className="mt-4 inline-block">
                <SandboxButton variant="primary" size="sm">
                  回世界档案
                </SandboxButton>
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] text-paper-muted">
          <ArrowLeftIcon size={13} /> 世界档案
        </Link>
        <div className="mt-6">
          <ErrorBanner message={error ?? "对比读取失败"} />
        </div>
      </div>
    );
  }

  const [left, right] = result.worlds;
  const [leftMetrics, rightMetrics] = result.metrics;
  const leftLatest = leftMetrics.at(-1) ?? null;
  const rightLatest = rightMetrics.at(-1) ?? null;
  const cards = Array.from({ length: Math.max(result.cards.length, 0) }, (_, index) => {
    const pair = result.cards[index];
    return { a: pair?.a ?? null, b: pair?.b ?? null };
  }).filter((pair) => pair.a || pair.b);

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[11px] text-paper-muted transition-colors hover:text-paper"
        >
          <ArrowLeftIcon size={13} /> 世界档案
        </Link>
        <Link
          to={`/compare/${left.id}`}
          className="text-[10px] text-paper-muted transition-colors hover:text-paper"
        >
          换一个 B 侧
        </Link>
      </div>

      <header className="mt-3 border-b border-ink-line/70 pb-4">
        <h1 className="font-display text-3xl tracking-tight text-paper">两条走向</h1>
        <p className="mt-1.5 text-xs leading-6 text-paper-muted">
          只比最后一轮的四项指标与三组名场面。长度不同的世界，不强行对齐轮次。
        </p>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <WorldColumn world={left} side="A" />
        <span className="hidden self-center px-1 font-display text-sm text-paper-muted/40 lg:block">
          vs
        </span>
        <WorldColumn world={right} side="B" />
      </div>

      <section className="mt-6 border border-ink-line">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-line px-4 py-2.5">
          <h2 className="font-display text-sm tracking-tight text-paper">四项指标</h2>
          <span className="num text-[9px] text-paper-muted/60">
            A 第 {leftLatest?.round ?? "—"} 轮 / B 第 {rightLatest?.round ?? "—"} 轮 · 启发式
          </span>
        </header>
        <div className="divide-y divide-ink-line/50">
          {COMPARE_METRICS.map((metric) => {
            const leftValue = leftLatest ? leftLatest[metric.key] : null;
            const rightValue = rightLatest ? rightLatest[metric.key] : null;
            const delta = leftValue !== null && rightValue !== null ? leftValue - rightValue : null;
            return (
              <div
                key={metric.key}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[120px_1fr_1fr_100px]"
              >
                <div>
                  <div className="text-[11px] text-paper">{metric.label}</div>
                  <div className="text-[9px] text-paper-muted/60">{metric.hint}</div>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="h-[2px] w-16 bg-ink-line">
                    <span
                      className="block h-full bg-amber"
                      style={{
                        width: `${leftValue === null ? 0 : metricBarPercent(metric.key, leftValue)}%`,
                      }}
                    />
                  </span>
                  <span className="num w-10 text-right text-sm text-paper">
                    {leftValue === null ? "—" : fixed(leftValue)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-[2px] w-16 bg-ink-line">
                    <span
                      className="block h-full bg-teal"
                      style={{
                        width: `${rightValue === null ? 0 : metricBarPercent(metric.key, rightValue)}%`,
                      }}
                    />
                  </span>
                  <span className="num w-10 text-right text-sm text-paper">
                    {rightValue === null ? "—" : fixed(rightValue)}
                  </span>
                </div>
                <div className="num hidden text-right text-[10px] text-paper-muted sm:block">
                  {delta === null
                    ? "—"
                    : Math.abs(delta) < 0.005
                      ? "持平"
                      : `${delta > 0 ? "A 高" : "B 高"} ${fixed(Math.abs(delta))}`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg tracking-tight text-paper">名场面对照</h2>
          <span className="text-[9px] text-paper-muted/60">双方同序号并排；缺失时留白</span>
        </div>
        {cards.length === 0 ? (
          <div className="border border-ink-line px-4 py-6 text-[11px] text-paper-muted">
            名场面还没有整理出来。世界跑过后，可从任意一侧的世界页触发整理。
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((pair) => (
              <div
                key={`${pair.a?.ref ?? "a"}-${pair.b?.ref ?? "b"}`}
                className="grid gap-3 md:grid-cols-2"
              >
                {[
                  { card: pair.a, side: "A" },
                  { card: pair.b, side: "B" },
                ].map(({ card, side }) => (
                  <div
                    key={side}
                    className="flex min-h-28 flex-col justify-between border border-ink-line px-4 py-3"
                  >
                    {card ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-amber">
                            {card.type}
                          </span>
                          <span className="num text-[9px] text-paper-muted/50">
                            {side} · #{card.ref}
                          </span>
                        </div>
                        <p className="mt-2 font-display text-[15px] leading-6 text-paper">
                          “{card.quote}”
                        </p>
                        <p className="mt-2 text-[10px] leading-5 text-paper-muted">{card.why}</p>
                      </>
                    ) : (
                      <div className="flex h-full items-center text-[10px] text-paper-muted/50">
                        这一侧没有对应的名场面。
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-8 text-[9px] leading-5 text-paper-muted/50">
        A 侧 {left.title}：分叉轮 {left.forkRound ?? "原创"}，当前第 {left.currentRound} 轮；B 侧{" "}
        {right.title}：分叉轮 {right.forkRound ?? "原创"}，当前第 {right.currentRound} 轮。
        指标单位为 0–1，仅供参考；同名场面卡按生成顺序对齐，不代表同一事件。
      </p>
    </div>
  );
}
