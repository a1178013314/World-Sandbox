import type { EmergenceCard } from "@ifss/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { CastPanel } from "@/features/sandbox/cast-panel";
import { EmergenceBar } from "@/features/sandbox/emergence-bar";
import { FeedPanel } from "@/features/sandbox/feed-panel";
import { isBudgetPause, truncate, typedError } from "@/features/sandbox/format";
import { GodPanel } from "@/features/sandbox/god-panel";
import { ForkIcon, RefreshIcon } from "@/features/sandbox/icons";
import {
  Dialog,
  ErrorBanner,
  Field,
  inputClass,
  SandboxButton,
  Spinner,
  selectClass,
  Tag,
} from "@/features/sandbox/ui";
import { useWorldStream } from "@/features/sandbox/use-world-stream";
import { WorldHeader } from "@/features/sandbox/world-header";
import { ApiError } from "@/lib/api";
import { sandboxApi } from "@/lib/sandbox-api";

interface ForkNotice {
  forkedFrom?: number;
}

export function WorldPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { view, connection, reconnect } = useWorldStream(id);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    const state = location.state as ForkNotice | null;
    return state?.forkedFrom ? `已从第 ${state.forkedFrom} 轮分出，原世界不受影响。` : null;
  });

  const [cards, setCards] = useState<EmergenceCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const autoCardsFor = useRef<string | null>(null);

  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewAgent, setInterviewAgent] = useState("");
  const [question, setQuestion] = useState("你当时为什么没有在群里说话？");
  const [interviewing, setInterviewing] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ answer: string; cited: number[] } | null>(null);

  const [forkOpen, setForkOpen] = useState(false);
  const [forkRound, setForkRound] = useState(1);
  const [forkText, setForkText] = useState("");
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const snapshot = view?.snapshot ?? null;

  const loadCards = useCallback(async () => {
    if (!id) return;
    setCardsLoading(true);
    setCardsError(null);
    try {
      const result = await sandboxApi.cards(id);
      setCards(result.cards);
    } catch (error) {
      setCardsError(error instanceof ApiError ? error.message : typedError(error));
    } finally {
      setCardsLoading(false);
    }
  }, [id]);

  const doneRound =
    snapshot?.world.status === "done" && snapshot.world.currentRound > 0
      ? snapshot.world.currentRound
      : null;

  useEffect(() => {
    if (!id || doneRound === null || autoCardsFor.current === id) {
      return;
    }
    autoCardsFor.current = id;
    void loadCards();
  }, [id, doneRound, loadCards]);

  useEffect(() => {
    if (!id) {
      return;
    }
    setCards([]);
    setCardsError(null);
    autoCardsFor.current = null;
  }, [id]);

  useEffect(() => {
    const forkedFrom = (location.state as ForkNotice | null)?.forkedFrom;
    setNotice(forkedFrom ? `已从第 ${forkedFrom} 轮分出，原世界不受影响。` : null);
  }, [location.state]);

  async function startRun(rounds: number): Promise<void> {
    if (!id) return;
    setBusy(true);
    setPageError(null);
    try {
      await sandboxApi.run(id, rounds);
    } catch (error) {
      setPageError(error instanceof ApiError ? error.message : typedError(error));
    } finally {
      setBusy(false);
    }
  }

  async function stopRun(): Promise<void> {
    if (!id) return;
    setBusy(true);
    setPageError(null);
    try {
      await sandboxApi.stop(id);
    } catch (error) {
      setPageError(error instanceof ApiError ? error.message : typedError(error));
    } finally {
      setBusy(false);
    }
  }

  async function inject(
    content: string,
    visibility: string,
    effectiveRound: number,
  ): Promise<void> {
    if (!id) return;
    await sandboxApi.inject(id, { content, visibility, effectiveRound });
    reconnect();
  }

  async function cancelInjection(seq: number): Promise<void> {
    if (!id) return;
    await sandboxApi.cancelInjection(id, seq);
    reconnect();
  }

  function openInterview(agentId?: string): void {
    const fallback = snapshot?.agents[0]?.agentId ?? "";
    setInterviewAgent(agentId ?? fallback);
    setAnswer(null);
    setInterviewError(null);
    setInterviewOpen(true);
  }

  async function ask(): Promise<void> {
    if (!id || !interviewAgent || !question.trim()) {
      setInterviewError("先选一个角色，再写下问题。");
      return;
    }
    setInterviewing(true);
    setInterviewError(null);
    setAnswer(null);
    try {
      const result = await sandboxApi.interview(id, interviewAgent, question.trim());
      setAnswer(result);
    } catch (error) {
      setInterviewError(error instanceof ApiError ? error.message : typedError(error));
    } finally {
      setInterviewing(false);
    }
  }

  function openFork(): void {
    if (!snapshot) return;
    if (snapshot.world.status === "running") {
      setPageError("世界正在运行。先停下，或等当前轮结束再分叉。");
      return;
    }
    if (snapshot.world.currentRound < 1) {
      setPageError("至少要跑完 1 轮，才有可以分叉的快照。");
      return;
    }
    setForkRound(snapshot.world.currentRound);
    setForkText("");
    setForkError(null);
    setForkOpen(true);
  }

  async function createFork(): Promise<void> {
    if (!id) return;
    setForking(true);
    setForkError(null);
    try {
      const result = await sandboxApi.fork(
        id,
        forkRound,
        forkText.trim() ? { content: forkText.trim(), visibility: "all" } : undefined,
      );
      setForkOpen(false);
      navigate(`/world/${result.id}`, { state: { forkedFrom: forkRound } });
    } catch (error) {
      setForkError(error instanceof ApiError ? error.message : typedError(error));
    } finally {
      setForking(false);
    }
  }

  function jumpTo(seq: number): void {
    const node = document.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
    if (!node) {
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("outline", "outline-2", "outline-amber/70", "outline-offset-2");
    window.setTimeout(() => {
      node.classList.remove("outline", "outline-2", "outline-amber/70", "outline-offset-2");
    }, 1_600);
  }

  if (!snapshot || !view) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        {connection === "offline" ? (
          <>
            <p className="font-display text-xl text-paper">没有接上这个世界的信号。</p>
            <p className="max-w-[36ch] text-xs leading-6 text-paper-muted">
              后端可能没启动，或世界已经不存在。重连会从最后一条事件开始补齐。
            </p>
            <SandboxButton variant="primary" onClick={reconnect}>
              <RefreshIcon size={14} />
              重新连接
            </SandboxButton>
          </>
        ) : (
          <>
            <Spinner className="size-5 text-amber" />
            <p className="font-display text-lg text-paper">正在接入世界…</p>
            <p className="text-[10px] text-paper-muted">等待 snapshot，随后补齐全部事件。</p>
          </>
        )}
      </div>
    );
  }

  const budget = isBudgetPause(snapshot.world);

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-1 flex-col px-4 pb-10 pt-3 sm:px-6">
      <WorldHeader
        snapshot={snapshot}
        connection={connection}
        busy={busy}
        onReconnect={reconnect}
        onRun={(rounds) => void startRun(rounds)}
        onStop={() => void stopRun()}
        onFork={openFork}
      />

      <div className="space-y-2 pb-3">
        {notice ? (
          <div className="flex items-center justify-between gap-3 border border-teal/30 bg-teal/[0.06] px-3 py-2 text-[11px] text-teal">
            <span className="inline-flex items-center gap-1.5">
              <ForkIcon size={13} /> {notice}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-teal/60 hover:text-teal"
            >
              知道了
            </button>
          </div>
        ) : null}
        {snapshot.world.status === "paused" && snapshot.world.errorText ? (
          <div className="flex flex-col justify-between gap-2 border border-amber/35 bg-amber/[0.06] px-3 py-2.5 text-[11px] leading-5 text-amber sm:flex-row sm:items-center">
            <div>
              <span className="font-medium">
                {budget ? "调用预算耗尽，世界停在这里。" : "世界被暂停。"}
              </span>
              <span className="ml-2 text-amber/80">{truncate(snapshot.world.errorText, 160)}</span>
            </div>
            <div className="flex gap-2">
              {!budget ? (
                <SandboxButton
                  size="sm"
                  variant="outline"
                  busy={busy}
                  onClick={() => void startRun(1)}
                >
                  继续 1 轮
                </SandboxButton>
              ) : null}
              <SandboxButton size="sm" variant="primary" onClick={openFork}>
                <ForkIcon size={12} />
                分叉保存火种
              </SandboxButton>
            </div>
          </div>
        ) : null}
        {pageError ? <ErrorBanner message={pageError} onClose={() => setPageError(null)} /> : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_324px] lg:items-start">
        <CastPanel
          snapshot={snapshot}
          live={view.live}
          events={view.events}
          onInterview={openInterview}
          className="order-2 lg:order-none"
        />
        <FeedPanel
          snapshot={snapshot}
          events={view.events}
          live={view.live}
          onRun={(rounds) => void startRun(rounds)}
          onInterview={openInterview}
          className="order-1 h-[62dvh] min-h-96 lg:order-none lg:h-[calc(100dvh-235px)] lg:min-h-[540px]"
        />
        <GodPanel
          snapshot={snapshot}
          onInject={inject}
          onCancel={cancelInjection}
          onFork={openFork}
          onInterview={openInterview}
          className="order-3 lg:order-none"
        />
      </div>

      <EmergenceBar
        cards={cards}
        loading={cardsLoading}
        error={cardsError}
        onRefresh={() => void loadCards()}
        onJump={jumpTo}
        className="mt-3"
      />

      <Dialog
        open={interviewOpen}
        onClose={() => setInterviewOpen(false)}
        title="采访一个角色"
        description="回答只来自该角色确实收到过的消息。引用为空，说明它当时没看见。"
        wide
        footer={
          <>
            <SandboxButton variant="ghost" onClick={() => setInterviewOpen(false)}>
              收起
            </SandboxButton>
            <SandboxButton variant="primary" busy={interviewing} onClick={() => void ask()}>
              提问
            </SandboxButton>
          </>
        }
      >
        <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
          <Field label="对象">
            <select
              className={selectClass}
              value={interviewAgent}
              onChange={(event) => {
                setInterviewAgent(event.target.value);
                setAnswer(null);
              }}
            >
              {snapshot.agents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.profile.name} · {agent.profile.role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="问题" hint="≤ 200 字">
            <input
              className={inputClass}
              maxLength={200}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void ask();
                }
              }}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "你当时为什么没有在群里说话？",
            "你怎么看这次物业费涨价？",
            "你收到那条公告了吗？",
            "这条消息是谁先说的？",
          ].map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => setQuestion(text)}
              className="border border-ink-line px-2 py-1 text-[10px] text-paper-muted transition-colors hover:border-amber/40 hover:text-amber"
            >
              {text}
            </button>
          ))}
        </div>
        {interviewError ? <ErrorBanner message={interviewError} /> : null}
        {interviewing ? (
          <div className="flex items-center gap-2 border border-ink-line px-3 py-6 text-xs text-paper-muted">
            <Spinner className="size-3.5" /> 它正在回忆自己看到过什么…
          </div>
        ) : null}
        {answer ? (
          <div className="border border-ink-line bg-ink px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-[0.18em] text-paper-muted/60">
                {snapshot.agents.find((agent) => agent.agentId === interviewAgent)?.profile.name}
              </span>
              <span className="num text-[9px] text-paper-muted/50">
                {answer.cited.length > 0 ? `${answer.cited.length} 条引用` : "无引用"}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-paper">
              {answer.answer}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-line/70 pt-2.5">
              {answer.cited.length === 0 ? (
                <span className="text-[10px] leading-5 text-paper-muted/70">
                  它没有引用任何群消息——可能当时不在线，也可能那条消息从未投递到它眼前。
                </span>
              ) : (
                answer.cited.map((seq) => (
                  <button
                    key={seq}
                    type="button"
                    onClick={() => {
                      setInterviewOpen(false);
                      window.setTimeout(() => jumpTo(seq), 60);
                    }}
                    className="num border border-ink-line px-1.5 py-0.5 text-[10px] text-paper-muted transition-colors hover:border-amber/40 hover:text-amber"
                  >
                    #{seq}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
        {!answer && !interviewing ? (
          <p className="text-[10px] leading-5 text-paper-muted/60">
            采访不计入群聊事件，也不改变角色记忆；它只是从快照里取出这个人知道的事。
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={forkOpen}
        onClose={() => setForkOpen(false)}
        title={`从第 ${forkRound} 轮分叉`}
        description="新世界完整复制到此轮为止的事件、投递与角色快照；此后的走向与原世界无关。"
        footer={
          <>
            <SandboxButton variant="ghost" onClick={() => setForkOpen(false)}>
              取消
            </SandboxButton>
            <SandboxButton variant="primary" busy={forking} onClick={() => void createFork()}>
              <ForkIcon size={14} />
              建立分叉世界
            </SandboxButton>
          </>
        }
      >
        <Field label="分叉点" hint={`可选 1–${snapshot.world.currentRound} 轮`}>
          <select
            className={selectClass}
            value={forkRound}
            onChange={(event) => setForkRound(Number(event.target.value))}
          >
            {Array.from({ length: snapshot.world.currentRound }, (_, index) => index + 1)
              .reverse()
              .map((round) => (
                <option key={round} value={round}>
                  第 {round} 轮结束
                </option>
              ))}
          </select>
        </Field>
        <Field label="分叉时追加事实" hint="可留空">
          <textarea
            className={`${inputClass} min-h-20 resize-y text-[12px] leading-relaxed`}
            maxLength={200}
            placeholder="如果这一次，群里提前收到另一条消息……"
            value={forkText}
            onChange={(event) => setForkText(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-paper-muted">
          <Tag tone="amber">第 1–{forkRound} 轮逐字一致</Tag>
          <Tag tone="muted">预算重新计数</Tag>
          <Tag tone="muted">原世界不变</Tag>
        </div>
        {forkError ? <ErrorBanner message={forkError} /> : null}
      </Dialog>
    </div>
  );
}
