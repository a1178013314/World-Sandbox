import type { WorldSnapshot } from "@ifss/shared";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fixed, isBudgetPause, latestMetrics, METRIC_ROWS, truncate, typedError } from "./format";
import { ForkIcon, SendIcon, SparkIcon, UsersIcon } from "./icons";
import { ErrorBanner, Field, inputClass, SandboxButton, selectClass, Tag } from "./ui";

const QUICK_EVENTS = [
  {
    label: "停水 6 小时",
    content: "物业通知：主管道抢修，今晚 18:00 起全小区停水 6 小时，恢复时间另行通知。",
  },
  {
    label: "名单泄露",
    content: "有人把一份「同意涨价业主名单」转进了群里，几户名字被红笔圈了出来。",
  },
  {
    label: "涨价追加",
    content: "物业补充公告：若本周五前缴费率不足 60%，下月起停车费同步上调。",
  },
  {
    label: "电梯坏了",
    content: "6 栋电梯再次停运，维保电话无人接听，业主群开始有人 @ 物业。",
  },
];

const MINI_METRICS: (typeof METRIC_ROWS)[number][] = METRIC_ROWS.filter((row) =>
  ["emotionTemperature", "silentRate", "escalationIndex", "polarization"].includes(row.key),
);

export function GodPanel({
  snapshot,
  onInject,
  onCancel,
  onFork,
  onInterview,
  className,
}: {
  snapshot: WorldSnapshot;
  onInject: (content: string, visibility: string, effectiveRound: number) => Promise<void>;
  onCancel: (seq: number) => Promise<void>;
  onFork: () => void;
  onInterview: (agentId?: string) => void;
  className?: string;
}) {
  const { world } = snapshot;
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [round, setRound] = useState(world.currentRound + 1);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const metrics = latestMetrics(snapshot);
  const done =
    world.status === "done" ||
    (world.status !== "running" && world.currentRound >= world.totalRounds);
  const budget = isBudgetPause(world);

  useEffect(() => {
    setRound(world.currentRound + 1);
  }, [world.currentRound]);

  async function submit(): Promise<void> {
    if (!content.trim()) {
      setError("写一条会进入群里的新事实。");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onInject(content.trim(), visibility, round);
      setContent("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : typedError(caught));
    } finally {
      setSending(false);
    }
  }

  async function cancel(seq: number): Promise<void> {
    setCancelling(seq);
    setError(null);
    try {
      await onCancel(seq);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : typedError(caught));
    } finally {
      setCancelling(null);
    }
  }

  return (
    <aside className={cn("space-y-3", className)}>
      <section className="border border-ink-line bg-ink-raised/30">
        <header className="flex items-baseline justify-between border-b border-ink-line px-3 py-2.5">
          <h2 className="font-display text-sm tracking-tight text-paper">上帝之手</h2>
          <span className="text-[9px] text-paper-muted/60">只改事实，不改人心</span>
        </header>
        <div className="space-y-3 p-3">
          {done ? (
            <p className="border border-ink-line px-2.5 py-2 text-[10px] leading-5 text-paper-muted">
              世界已经跑满。注入与再跑都会破坏回放，请先分叉出一个新世界。
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_EVENTS.map((event) => (
              <button
                key={event.label}
                type="button"
                disabled={done}
                onClick={() => setContent(event.content)}
                className="border border-ink-line px-1.5 py-1 text-[10px] text-paper-muted transition-colors hover:border-amber/40 hover:text-amber disabled:opacity-40"
              >
                {event.label}
              </button>
            ))}
          </div>
          <textarea
            aria-label="注入内容"
            className={`${inputClass} min-h-20 resize-y text-[12px] leading-relaxed`}
            placeholder="一条会被看见的新事实……"
            maxLength={200}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={done}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="投给">
              <select
                className={`${selectClass} text-[11px]`}
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
                disabled={done}
              >
                <option value="all">全群 · 在场者</option>
                {snapshot.agents.map((agent) => (
                  <option key={agent.agentId} value={agent.agentId}>
                    只给 {agent.profile.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="生效轮次">
              <input
                className={`${inputClass} num text-[11px]`}
                type="number"
                min={1}
                max={Math.max(1, world.totalRounds)}
                value={round}
                onChange={(event) => setRound(Number(event.target.value))}
                disabled={done}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="num text-[9px] text-paper-muted/50">{content.length} / 200</span>
            <SandboxButton
              size="sm"
              variant="primary"
              busy={sending}
              disabled={done}
              onClick={() => void submit()}
            >
              <SendIcon size={13} />
              投入世界
            </SandboxButton>
          </div>
          <p className="text-[9px] leading-4 text-paper-muted/60">
            全群公告也只投给生效轮次在场的人；定向注入会等到目标上线才交付。
          </p>
          {error ? <ErrorBanner message={error} onClose={() => setError(null)} /> : null}

          {snapshot.pendingInterventions.length > 0 ? (
            <div className="space-y-1.5 border-t border-ink-line/70 pt-2.5">
              <div className="text-[9px] uppercase tracking-[0.16em] text-paper-muted/60">
                待生效
              </div>
              {snapshot.pendingInterventions.map((item) => (
                <div
                  key={item.seq}
                  className="flex items-start gap-2 border border-ink-line/70 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Tag tone="amber">第 {item.round} 轮</Tag>
                      <span className="text-[9px] text-paper-muted/60">
                        {item.visibility === "all" || item.visibility === "public"
                          ? "全群"
                          : `定向 ${snapshot.agents.find((agent) => agent.agentId === item.visibility)?.profile.name ?? item.visibility}`}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-paper-muted">
                      {truncate(item.content, 56)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={cancelling === item.seq}
                    onClick={() => void cancel(item.seq)}
                    className="shrink-0 text-[9px] text-paper-muted/50 transition-colors hover:text-coral disabled:opacity-40"
                  >
                    撤销
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-ink-line bg-ink-raised/30">
        <header className="flex items-baseline justify-between border-b border-ink-line px-3 py-2.5">
          <h2 className="font-display text-sm tracking-tight text-paper">世界体温</h2>
          <span className="text-[9px] text-paper-muted/60">
            {metrics ? `第 ${metrics.round} 轮` : "尚无数据"} · 启发式
          </span>
        </header>
        <div className="space-y-2 p-3">
          {MINI_METRICS.map((row) => {
            const value = metrics ? metrics[row.key] : 0;
            return (
              <div key={row.key} className="flex items-center gap-2.5" title={row.hint}>
                <span className="w-14 shrink-0 text-[10px] text-paper-muted">{row.label}</span>
                <span className="h-[3px] flex-1 bg-ink-line">
                  <span
                    className={cn(
                      "block h-full transition-[width] duration-700",
                      row.key === "silentRate"
                        ? "bg-amber"
                        : row.key === "escalationIndex"
                          ? "bg-coral"
                          : "bg-teal",
                    )}
                    style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
                  />
                </span>
                <span className="num w-9 text-right text-[10px] text-paper">
                  {metrics ? fixed(value) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <SandboxButton variant="outline" onClick={() => onInterview()}>
          <UsersIcon size={14} />
          采访角色
        </SandboxButton>
        <SandboxButton variant="outline" onClick={onFork}>
          <ForkIcon size={14} />
          从此刻分叉
        </SandboxButton>
      </div>

      {budget ? (
        <p className="border border-coral/30 bg-coral/[0.05] px-2.5 py-2 text-[10px] leading-5 text-coral">
          预算已经烧完。世界停在这里；带上现有事件分叉，下一代会重新计数。
        </p>
      ) : null}
      <p className="flex items-center gap-1.5 px-1 text-[9px] leading-4 text-paper-muted/50">
        <SparkIcon size={11} />
        所有指标均为规则估算，不是精确概率。点开调试台可看每一次调用。
      </p>
    </aside>
  );
}
