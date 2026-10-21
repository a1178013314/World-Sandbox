import type { SandboxEvent, WorldSnapshot } from "@ifss/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  agentName,
  formatClock,
  formatDate,
  isBudgetPause,
  pct,
  shortId,
  statusTone,
  truncate,
  typedError,
  worldStatusLabel,
} from "@/features/sandbox/format";
import { ArrowLeftIcon, DownloadIcon, ForkIcon, RefreshIcon } from "@/features/sandbox/icons";
import { ErrorBanner, SandboxButton, Spinner, selectClass, Tag } from "@/features/sandbox/ui";
import type { CallLogRecord } from "@/lib/sandbox-api";
import { sandboxApi } from "@/lib/sandbox-api";

const PURPOSE_LABEL: Record<string, string> = {
  act: "发言决策",
  act_repair: "JSON 修复",
  compact: "记忆压缩",
  card: "名场面",
  interview: "采访",
  cast: "造人",
};

const KIND_LABEL: Record<string, string> = {
  post: "发帖",
  reply: "回复",
  like: "赞同",
  system: "系统",
  intervention: "注入",
};

async function fetchAllCalls(worldId: string): Promise<CallLogRecord[]> {
  const first = await sandboxApi.calls(worldId, { page: 1, pageSize: 100 });
  const items = [...first.items];
  let page = 2;
  while (items.length < first.total && page <= 3) {
    const next = await sandboxApi.calls(worldId, { page, pageSize: 100 });
    if (next.items.length === 0) break;
    items.push(...next.items);
    page += 1;
  }
  return items;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function WorldDebugPage() {
  const { id } = useParams();
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [events, setEvents] = useState<SandboxEvent[]>([]);
  const [calls, setCalls] = useState<CallLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("all");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [snap, eventRows, callRows] = await Promise.all([
        sandboxApi.world(id),
        sandboxApi.events(id),
        fetchAllCalls(id),
      ]);
      setSnapshot(snap);
      setEvents(eventRows);
      setCalls(callRows);
    } catch (caught) {
      setError(typedError(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportWorld(): Promise<void> {
    if (!id) return;
    setExporting(true);
    try {
      const payload = await sandboxApi.exportWorld(id);
      downloadJson(`ifss-world-${shortId(id)}.json`, payload);
    } catch (caught) {
      setError(typedError(caught));
    } finally {
      setExporting(false);
    }
  }

  const visibleCalls = purpose === "all" ? calls : calls.filter((call) => call.purpose === purpose);
  const actCalls = calls.filter((call) => call.purpose === "act");
  const failedCalls = calls.filter((call) => call.ok === 0);
  const callFor = (round: number, agentId: string | null): CallLogRecord | undefined =>
    actCalls.find((call) => call.round === round && call.agentId === agentId);

  if (loading && !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-24 text-xs text-paper-muted">
        <Spinner className="size-4 text-amber" /> 正在读取调用日志…
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] text-paper-muted">
          <ArrowLeftIcon size={13} /> 世界档案
        </Link>
        <div className="mt-6">
          <ErrorBanner message={error ?? "世界读取失败"} />
        </div>
      </div>
    );
  }

  const { world } = snapshot;
  const budgetLine = Math.min(100, (calls.length / 120) * 100);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={`/world/${world.id}`}
          className="inline-flex items-center gap-1.5 text-[11px] text-paper-muted transition-colors hover:text-paper"
        >
          <ArrowLeftIcon size={13} />
          回到世界
        </Link>
        <div className="flex items-center gap-1.5">
          <Link
            to={`/compare/${world.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[11px] text-paper-muted transition-colors hover:bg-ink-raised hover:text-paper"
          >
            <ForkIcon size={13} />
            对比
          </Link>
          <SandboxButton size="sm" variant="ghost" busy={loading} onClick={() => void load()}>
            <RefreshIcon size={13} />
            刷新
          </SandboxButton>
          <SandboxButton
            size="sm"
            variant="outline"
            busy={exporting}
            onClick={() => void exportWorld()}
          >
            <DownloadIcon size={13} />
            导出 JSON
          </SandboxButton>
        </div>
      </div>

      <header className="mt-3 border-b border-ink-line/70 pb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl tracking-tight text-paper sm:text-3xl">调试台</h1>
          <span className="text-xs text-paper-muted">{world.title}</span>
          <span
            className={`num text-[10px] uppercase tracking-[0.16em] ${statusTone(world.status)}`}
          >
            {worldStatusLabel(world)}
          </span>
          {isBudgetPause(world) ? <Tag tone="coral">预算耗尽</Tag> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-paper-muted">
          <span className="num">{world.id}</span>
          <span className="num">
            {world.currentRound} / {world.totalRounds} 轮
          </span>
          <span className="num">rng {world.rngSeed}</span>
          <span>{snapshot.agents.length} 角色</span>
          <span>创建于 {formatDate(world.createdAt)}</span>
        </div>
      </header>

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} onClose={() => setError(null)} />
        </div>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="border border-ink-line px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.16em] text-paper-muted/60">模型调用</div>
          <div className="num mt-1 text-xl text-paper">
            {calls.length}
            <span className="text-[10px] text-paper-muted/60"> / 120</span>
          </div>
          <div className="mt-2 h-[2px] bg-ink-line">
            <div
              className={`h-full ${budgetLine >= 100 ? "bg-coral" : "bg-amber"}`}
              style={{ width: `${budgetLine}%` }}
            />
          </div>
        </div>
        <div className="border border-ink-line px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.16em] text-paper-muted/60">失败调用</div>
          <div
            className={`num mt-1 text-xl ${failedCalls.length > 0 ? "text-coral" : "text-paper"}`}
          >
            {failedCalls.length}
          </div>
          <div className="mt-2 text-[9px] text-paper-muted/60">
            超时、非法 JSON 或 provider 错误会留在这里。
          </div>
        </div>
        <div className="border border-ink-line px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.16em] text-paper-muted/60">
            事件 / 投递
          </div>
          <div className="num mt-1 text-xl text-paper">
            {events.length}
            <span className="text-[10px] text-paper-muted/60"> 条</span>
          </div>
          <div className="mt-2 text-[9px] text-paper-muted/60">
            门拦 = 零调用；模型忽略 = 有调用，无事件。
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg tracking-tight text-paper">轮次判定</h2>
          <span className="text-[9px] text-paper-muted/60">
            沉默分三种：门拦、模型忽略、调用失败
          </span>
        </div>
        <div className="overflow-x-auto border border-ink-line">
          <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-ink-line text-[9px] uppercase tracking-[0.14em] text-paper-muted/60">
                <th className="px-3 py-2 font-normal">轮</th>
                <th className="px-3 py-2 font-normal">时间</th>
                <th className="px-3 py-2 font-normal">在线</th>
                <th className="px-3 py-2 font-normal">发言</th>
                <th className="px-3 py-2 font-normal">未发言（有调用）</th>
                <th className="px-3 py-2 font-normal">门拦（零调用）</th>
                <th className="px-3 py-2 font-normal">失败</th>
                <th className="px-3 py-2 text-right font-normal">张力</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rounds.map((round) => {
                const ignored = round.silentIds.filter(
                  (agentId) => callFor(round.round, agentId)?.ok === 1,
                );
                const failed = round.silentIds.filter(
                  (agentId) => callFor(round.round, agentId)?.ok === 0,
                );
                return (
                  <tr
                    key={round.round}
                    className="border-b border-ink-line/50 align-top last:border-0"
                  >
                    <td className="num px-3 py-2 text-amber">{round.round}</td>
                    <td className="num px-3 py-2 text-paper-muted">{round.timeLabel ?? "—"}</td>
                    <td className="num px-3 py-2 text-paper">{round.activeIds.length}</td>
                    <td className="num px-3 py-2 text-teal">{round.spokeIds.length}</td>
                    <td className="px-3 py-2 text-paper-muted">
                      {round.silentIds.length - failed.length}
                      {ignored.length > 0 ? (
                        <span className="ml-1 text-[9px] text-paper-muted/60">
                          （
                          {ignored.map((agentId) => agentName(snapshot.agents, agentId)).join("、")}
                          ）
                        </span>
                      ) : null}
                    </td>
                    <td className="num px-3 py-2 text-coral">
                      {round.gatedIds.length}
                      {round.gatedIds.length > 0 ? (
                        <span className="ml-1 text-[9px] text-coral/60">
                          {round.gatedIds
                            .map((agentId) => agentName(snapshot.agents, agentId))
                            .join("、")}
                        </span>
                      ) : null}
                    </td>
                    <td className="num px-3 py-2 text-coral/80">{failed.length}</td>
                    <td className="num px-3 py-2 text-right text-paper">
                      {round.metrics ? pct(round.metrics.tension) : "—"}
                    </td>
                  </tr>
                );
              })}
              {snapshot.rounds.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[10px] text-paper-muted">
                    还没有完成任何轮次。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg tracking-tight text-paper">事件追溯</h2>
          <span className="text-[9px] text-paper-muted/60">
            调用按「轮次 + 角色」关联；同一 Agent 一轮只做一次决策。
          </span>
        </div>
        <div className="sandbox-scroll max-h-[420px] overflow-auto border border-ink-line">
          <table className="w-full min-w-[880px] border-collapse text-left text-[11px]">
            <thead className="sticky top-0 bg-ink">
              <tr className="border-b border-ink-line text-[9px] uppercase tracking-[0.14em] text-paper-muted/60">
                <th className="px-3 py-2 font-normal">seq</th>
                <th className="px-3 py-2 font-normal">轮</th>
                <th className="px-3 py-2 font-normal">角色</th>
                <th className="px-3 py-2 font-normal">类型</th>
                <th className="px-3 py-2 font-normal">内容</th>
                <th className="px-3 py-2 font-normal">prompt_hash</th>
                <th className="px-3 py-2 text-right font-normal">耗时</th>
                <th className="px-3 py-2 font-normal">结果</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const call = callFor(event.round, event.actorId);
                return (
                  <tr
                    key={event.seq}
                    className="border-b border-ink-line/40 align-top last:border-0"
                  >
                    <td className="num px-3 py-1.5 text-paper-muted">{event.seq}</td>
                    <td className="num px-3 py-1.5 text-paper-muted">{event.round}</td>
                    <td className="px-3 py-1.5 text-paper">
                      {agentName(snapshot.agents, event.actorId)}
                    </td>
                    <td className="px-3 py-1.5 text-paper-muted">
                      {KIND_LABEL[event.kind] ?? event.kind}
                    </td>
                    <td className="max-w-[360px] px-3 py-1.5 text-paper-muted">
                      {truncate((event.content ?? "").replace(/\s+/g, " "), 90)}
                    </td>
                    <td
                      className="num px-3 py-1.5 text-[10px] text-paper-muted/70"
                      title={call?.promptHash}
                    >
                      {call ? shortId(call.promptHash) : "—"}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-paper-muted">
                      {call?.latencyMs !== null && call?.latencyMs !== undefined
                        ? `${call.latencyMs}ms`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {event.kind === "intervention" ? (
                        <Tag tone="amber">上帝之手</Tag>
                      ) : event.kind === "system" ? (
                        <Tag tone="muted">系统</Tag>
                      ) : event.kind === "like" ? (
                        <span className="text-[9px] text-paper-muted/50">派生动作</span>
                      ) : call ? (
                        <span className="text-[9px] text-teal">ok</span>
                      ) : (
                        <span className="text-[9px] text-paper-muted/50">无调用记录</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[10px] text-paper-muted">
                    还没有事件。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-lg tracking-tight text-paper">调用日志</h2>
            <span className="num text-[9px] text-paper-muted/60">
              {visibleCalls.length} / {calls.length}
            </span>
          </div>
          <select
            className={`${selectClass} w-40 py-1.5 text-[11px]`}
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            aria-label="调用类型筛选"
          >
            <option value="all">全部类型</option>
            {Object.entries(PURPOSE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="sandbox-scroll max-h-[520px] overflow-auto border border-ink-line">
          <table className="w-full min-w-[940px] border-collapse text-left text-[11px]">
            <thead className="sticky top-0 bg-ink">
              <tr className="border-b border-ink-line text-[9px] uppercase tracking-[0.14em] text-paper-muted/60">
                <th className="px-3 py-2 font-normal">时间</th>
                <th className="px-3 py-2 font-normal">轮</th>
                <th className="px-3 py-2 font-normal">角色</th>
                <th className="px-3 py-2 font-normal">用途</th>
                <th className="px-3 py-2 font-normal">模型</th>
                <th className="px-3 py-2 font-normal">prompt_hash</th>
                <th className="px-3 py-2 text-right font-normal">tokens</th>
                <th className="px-3 py-2 text-right font-normal">耗时</th>
                <th className="px-3 py-2 font-normal">结果</th>
                <th className="px-3 py-2 font-normal">错误</th>
              </tr>
            </thead>
            <tbody>
              {visibleCalls.map((call) => (
                <tr key={call.id} className="border-b border-ink-line/40 align-top last:border-0">
                  <td className="num px-3 py-1.5 text-[10px] text-paper-muted/70">
                    {formatClock(call.createdAt)}
                  </td>
                  <td className="num px-3 py-1.5 text-paper-muted">{call.round ?? "—"}</td>
                  <td className="px-3 py-1.5 text-paper">
                    {call.agentId ? agentName(snapshot.agents, call.agentId) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-paper-muted">
                    {PURPOSE_LABEL[call.purpose] ?? call.purpose}
                  </td>
                  <td className="num px-3 py-1.5 text-[10px] text-paper-muted/70">{call.model}</td>
                  <td
                    className="num px-3 py-1.5 text-[10px] text-paper-muted/70"
                    title={call.promptHash}
                  >
                    {shortId(call.promptHash)}
                  </td>
                  <td className="num px-3 py-1.5 text-right text-paper-muted">
                    {call.tokensIn ?? "—"} / {call.tokensOut ?? "—"}
                  </td>
                  <td className="num px-3 py-1.5 text-right text-paper-muted">
                    {call.latencyMs !== null ? `${call.latencyMs}ms` : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {call.ok === 1 ? (
                      <span className="text-[9px] text-teal">ok</span>
                    ) : (
                      <span className="text-[9px] text-coral">fail</span>
                    )}
                  </td>
                  <td className="max-w-[240px] px-3 py-1.5 text-[10px] text-coral/80">
                    {call.error ? truncate(call.error, 60) : "—"}
                  </td>
                </tr>
              ))}
              {visibleCalls.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-[10px] text-paper-muted">
                    这种类型的调用还没有发生。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-5 flex flex-wrap items-center gap-2 text-[9px] text-paper-muted/50">
        <Tag tone="muted">启发式指标</Tag>
        所有指标由规则计算，不是精确概率。缓存命中的调用同样记入日志，token 成本不重复计。
      </p>
    </div>
  );
}
