import {
  type AgentProfile,
  type ForgePackResult,
  type PackConfig,
  type PackSummary,
  type StancePosition,
  WORLD_MAX_ROUNDS,
  WORLD_MIN_ROUNDS,
  type WorldRecord,
} from "@ifss/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  formatDate,
  isBudgetPause,
  POSITION_LABEL,
  pct,
  statusTone,
  truncate,
  typedError,
  worldStatusLabel,
} from "@/features/sandbox/format";
import {
  ArrowUpRightIcon,
  ForkIcon,
  MapIcon,
  PlusIcon,
  SparkIcon,
  UploadIcon,
} from "@/features/sandbox/icons";
import {
  Dialog,
  ErrorBanner,
  Field,
  inputClass,
  SandboxButton,
  Spinner,
  selectClass,
} from "@/features/sandbox/ui";
import { ApiError } from "@/lib/api";
import { sandboxApi } from "@/lib/sandbox-api";

const QUICK_SEEDS = [
  "物业费要涨了，群里还没人说话。",
  "电梯停了两天，维修基金却查不到明细。",
  "有人在群里发了一张据说是内部的涨价名单。",
];

function clampRounds(value: number): number {
  return Math.min(WORLD_MAX_ROUNDS, Math.max(WORLD_MIN_ROUNDS, Math.round(value)));
}

function WorldRow({ world }: { world: WorldRecord }) {
  return (
    <Link
      to={`/world/${world.id}`}
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 border-b border-ink-line/70 px-3 py-4 transition-colors hover:bg-ink-raised/70 focus-visible:bg-ink-raised/70"
    >
      <span
        className={`mt-1 size-2 rounded-full ${world.status === "running" ? "live-pulse bg-teal" : world.status === "done" ? "bg-paper-muted/40" : world.status === "paused" ? "bg-amber" : "bg-paper/50"}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="truncate font-display text-[17px] tracking-tight text-paper">
            {world.title}
          </span>
          <span
            className={`num text-[10px] uppercase tracking-[0.16em] ${statusTone(world.status)}`}
          >
            {worldStatusLabel(world)}
          </span>
          {world.parentId ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-paper-muted">
              <ForkIcon size={11} /> 第 {world.forkRound ?? "?"} 轮分叉
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-paper-muted">
          {truncate(world.seed.text.replace(/\s+/g, " "), 72)}
        </p>
        <p className="num mt-1.5 text-[10px] text-paper-muted/70">
          {world.packId} · {world.castSource === "preset" ? "预置角色" : "生成角色"} ·{" "}
          {formatDate(world.createdAt)}
          {isBudgetPause(world) ? " · 预算耗尽" : ""}
        </p>
      </div>
      <div className="flex items-center gap-4 self-start">
        <div className="text-right">
          <div className="num text-sm text-paper">
            {world.currentRound}
            <span className="text-paper-muted/60"> / {world.totalRounds}</span>
          </div>
          <div className="num text-[10px] text-paper-muted/70">轮</div>
        </div>
        <ArrowUpRightIcon
          size={15}
          className="text-paper-muted/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-amber"
        />
      </div>
    </Link>
  );
}

export function WorldsPage() {
  const navigate = useNavigate();
  const [worlds, setWorlds] = useState<WorldRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [packId, setPackId] = useState("estate");
  const [pack, setPack] = useState<PackConfig | null>(null);
  const [seedText, setSeedText] = useState("");
  const [totalRounds, setTotalRounds] = useState(WORLD_MIN_ROUNDS);
  const [mode, setMode] = useState<"preset" | "generated">("preset");
  const [castSize, setCastSize] = useState(12);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [forgePrompt, setForgePrompt] = useState("");
  const [forging, setForging] = useState(false);
  const [forgeResult, setForgeResult] = useState<ForgePackResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    sandboxApi
      .worlds()
      .then((rows) => {
        if (!cancelled) setWorlds(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(typedError(error));
          setWorlds([]);
        }
      });
    sandboxApi
      .packs()
      .then((rows) => {
        const first = rows[0];
        if (cancelled || !first) return;
        setPacks(rows);
        setPackId((current) => (rows.some((row) => row.id === current) ? current : first.id));
      })
      .catch(() => setPacks([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPack(null);
    sandboxApi
      .pack(packId)
      .then((value) => {
        if (cancelled) return;
        setPack(value);
        setSeedText(value.seed.text);
        setTotalRounds(clampRounds(value.recommendedRounds));
        setCastSize(Math.min(12, Math.max(3, value.initialCast.length)));
        setProfiles([]);
        setMode("preset");
      })
      .catch((error: unknown) => {
        if (!cancelled) setFormError(typedError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [packId]);

  async function handleGenerate(): Promise<void> {
    if (!seedText.trim()) {
      setFormError("先写下这世界的起点。");
      return;
    }
    setGenerating(true);
    setFormError(null);
    try {
      const cast = await sandboxApi.previewCast(seedText, castSize);
      setProfiles(cast);
      setMode("generated");
    } catch (error) {
      setFormError(typedError(error));
    } finally {
      setGenerating(false);
    }
  }

  async function handleForge(): Promise<void> {
    const prompt = forgePrompt.trim();
    if (!prompt) {
      setFormError("先写一句话，比如一件正在发生的事。");
      return;
    }
    setForging(true);
    setFormError(null);
    try {
      const result = await sandboxApi.forgePack({
        prompt,
        castSize: Math.min(castSize, 8),
        totalRounds,
      });
      setForgeResult(result);
      setPacks(await sandboxApi.packs());
      setPackId(result.pack.id);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : typedError(error));
    } finally {
      setForging(false);
    }
  }

  async function handleCreate(): Promise<void> {
    if (!pack) {
      setFormError("种子包还没加载完成。");
      return;
    }
    if (mode === "generated" && profiles.length === 0) {
      setFormError("先生成一版角色，再决定谁进场。");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const rounds = clampRounds(totalRounds);
      setTotalRounds(rounds);
      const { id } = await sandboxApi.createWorld({
        packId,
        seedText,
        totalRounds: rounds,
        cast: mode === "preset" ? "preset" : profiles,
      });
      navigate(`/world/${id}`);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : typedError(error));
    } finally {
      setCreating(false);
    }
  }

  async function importPayload(text: string): Promise<void> {
    setImporting(true);
    setFormError(null);
    try {
      const payload = JSON.parse(text) as unknown;
      const { id } = await sandboxApi.importWorld(payload);
      setImportOpen(false);
      setImportText("");
      navigate(`/world/${id}`);
    } catch (error) {
      setFormError(error instanceof SyntaxError ? "文件不是合法 JSON。" : typedError(error));
    } finally {
      setImporting(false);
    }
  }

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;
    await importPayload(await file.text());
  }

  function updateProfile(index: number, patch: Partial<AgentProfile>): void {
    setProfiles((current) =>
      current.map((profile, position) => (position === index ? { ...profile, ...patch } : profile)),
    );
  }

  const preview = profiles[0];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-10 sm:px-6 lg:pt-14">
      <section className="grid gap-10 border-b border-ink-line/70 pb-12 lg:grid-cols-[1fr_420px] lg:gap-16">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl leading-[1.18] tracking-tight text-paper sm:text-5xl">
            把一句话，放进
            <br />
            一群有立场的人中间。
          </h1>
          <p className="mt-5 max-w-[46ch] text-sm leading-7 text-paper-muted">
            选择种子、召集角色、按下轮次。谁先开口、谁装作没看见、谁被门拦下，都会变成可追溯的事件；
            不服气，就从任意一轮分叉重来。
          </p>
          <dl className="num mt-8 flex flex-wrap gap-x-8 gap-y-3 text-[11px] text-paper-muted">
            <div className="flex items-baseline gap-2">
              <dt className="text-paper-muted/60">预置角色</dt>
              <dd className="text-paper">{pack?.initialCast.length ?? "—"} 人</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-paper-muted/60">推荐轮次</dt>
              <dd className="text-paper">{pack?.recommendedRounds ?? "—"} 轮</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-paper-muted/60">每个世界调用上限</dt>
              <dd className="text-paper">120 次</dd>
            </div>
          </dl>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#create"
              className="inline-flex h-10 items-center gap-2 rounded-sm bg-amber px-4 text-sm font-medium text-ink transition-colors hover:bg-[#e7b455]"
            >
              <PlusIcon size={15} />
              造一个新世界
            </a>
            <SandboxButton variant="ghost" onClick={() => setImportOpen(true)}>
              <UploadIcon size={15} />
              导入已跑世界
            </SandboxButton>
          </div>
        </div>

        <aside id="create" className="scroll-mt-20">
          <div className="border border-ink-line bg-ink-raised/50">
            <div className="border-b border-ink-line px-4 py-3">
              <h2 className="font-display text-lg tracking-tight text-paper">新建世界</h2>
              <p className="mt-0.5 text-[11px] text-paper-muted">
                先定场景与角色，开场后一切按轮次发生。
              </p>
            </div>
            <div className="space-y-4 p-4">
              {formError ? (
                <ErrorBanner message={formError} onClose={() => setFormError(null)} />
              ) : null}

              <div className="space-y-2 border border-ink-line/70 bg-ink/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-paper-muted">
                    一句话起盘
                  </span>
                  <span className="text-[10px] text-paper-muted/70">联网检索 · 自动配角色</span>
                </div>
                <textarea
                  className={`${inputClass} min-h-16 resize-y text-[13px] leading-relaxed`}
                  value={forgePrompt}
                  onChange={(event) => setForgePrompt(event.target.value)}
                  placeholder="比如：我们小区物业突然通知，物业费要从 2.8 涨到 3.8"
                />
                <SandboxButton
                  size="sm"
                  variant="outline"
                  className="w-full"
                  busy={forging}
                  disabled={!forgePrompt.trim()}
                  onClick={handleForge}
                >
                  <SparkIcon size={14} />
                  {forging ? "正在检索并装配…" : "检索资料，生成种子包"}
                </SandboxButton>
                {forgeResult ? (
                  <div className="space-y-1.5 border-t border-ink-line/60 pt-2">
                    <p className="text-[11px] leading-relaxed text-paper">
                      已生成 <span className="text-amber">{forgeResult.pack.name}</span>
                      <span className="text-paper-muted">
                        {" "}
                        · {forgeResult.pack.initialCast.length} 人 · 已选中
                      </span>
                    </p>
                    {forgeResult.sources.length > 0 ? (
                      <ul className="space-y-1">
                        {forgeResult.sources.slice(0, 3).map((source) => (
                          <li key={source.url} className="truncate text-[10px]">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-paper-muted underline decoration-ink-line underline-offset-2 transition-colors hover:text-amber"
                            >
                              {truncate(source.title, 30)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-paper-muted/70">
                        {forgeResult.searchFailed
                          ? "检索没成功，已按你的输入直接生成。"
                          : "没检索到可用资料，已按你的输入直接生成。"}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] leading-relaxed text-paper-muted/60">
                    先联网找资料，再把事实、人物和立场配成种子包；最多 8 人，约 60–90
                    秒。生成后自动选中，可改种子再建世界。
                  </p>
                )}
              </div>

              <Field label="种子包">
                <select
                  className={selectClass}
                  value={packId}
                  onChange={(event) => setPackId(event.target.value)}
                  disabled={packs.length === 0}
                >
                  {packs.length === 0 ? <option value="estate">正在读取 packs…</option> : null}
                  {packs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>

              {pack ? (
                <div className="border border-ink-line/70 px-3 py-2.5 text-[11px] text-paper-muted">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-display text-sm text-paper">{pack.seed.scene}</span>
                    <span className="num">{pack.seed.timeSlots.join(" · ")}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {QUICK_SEEDS.map((text) => (
                      <button
                        key={text}
                        type="button"
                        onClick={() => setSeedText(text)}
                        className="border border-ink-line px-1.5 py-1 text-[10px] text-paper-muted transition-colors hover:border-amber/40 hover:text-amber"
                      >
                        {truncate(text, 18)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <Field label="开场种子" hint={`${seedText.length} 字`}>
                <textarea
                  className={`${inputClass} min-h-24 resize-y leading-relaxed`}
                  value={seedText}
                  onChange={(event) => setSeedText(event.target.value)}
                  placeholder="群里发生的第一件事……"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="总轮次" hint={`${WORLD_MIN_ROUNDS}–${WORLD_MAX_ROUNDS} 轮`}>
                  <input
                    className={`${inputClass} num`}
                    type="number"
                    min={WORLD_MIN_ROUNDS}
                    max={WORLD_MAX_ROUNDS}
                    step={1}
                    value={totalRounds}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) setTotalRounds(next);
                    }}
                    onBlur={() => setTotalRounds((current) => clampRounds(current))}
                  />
                </Field>
                <Field label="角色来源">
                  <select
                    className={selectClass}
                    value={mode}
                    onChange={(event) => setMode(event.target.value as "preset" | "generated")}
                  >
                    <option value="preset">预置角色</option>
                    <option value="generated" disabled={profiles.length === 0}>
                      生成角色
                    </option>
                  </select>
                </Field>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 border border-ink-line px-2.5 py-1.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-paper-muted">
                    人数
                  </span>
                  <input
                    className="num w-12 bg-transparent text-sm text-paper outline-none"
                    type="number"
                    min={3}
                    max={12}
                    value={castSize}
                    onChange={(event) => setCastSize(Number(event.target.value))}
                  />
                </label>
                <SandboxButton
                  size="sm"
                  variant="outline"
                  busy={generating}
                  onClick={handleGenerate}
                  className="flex-1"
                >
                  按种子生成角色
                </SandboxButton>
              </div>

              {profiles.length > 0 ? (
                <div className="max-h-64 space-y-2 overflow-y-auto border-y border-ink-line/70 py-2 sandbox-scroll">
                  {profiles.map((profile, index) => (
                    <div
                      key={profile.id}
                      className="space-y-1.5 border-b border-ink-line/40 pb-2 last:border-0"
                    >
                      <div className="flex gap-2">
                        <input
                          aria-label={`角色 ${index + 1} 姓名`}
                          className="w-20 bg-transparent font-display text-sm text-paper outline-none"
                          value={profile.name}
                          onChange={(event) => updateProfile(index, { name: event.target.value })}
                        />
                        <input
                          aria-label={`角色 ${index + 1} 身份`}
                          className="min-w-0 flex-1 bg-transparent text-[11px] text-paper-muted outline-none"
                          value={profile.role}
                          onChange={(event) => updateProfile(index, { role: event.target.value })}
                        />
                        <select
                          aria-label={`角色 ${index + 1} 立场`}
                          className="bg-transparent text-[10px] text-paper-muted outline-none"
                          value={profile.stance.position}
                          onChange={(event) =>
                            updateProfile(index, {
                              stance: {
                                ...profile.stance,
                                position: event.target.value as StancePosition,
                              },
                            })
                          }
                        >
                          {Object.entries(POSITION_LABEL).map(([value, label]) => (
                            <option key={value} value={value} className="bg-ink-raised">
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-paper-muted">
                        <label className="flex flex-1 items-center gap-2">
                          影响
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(profile.influence * 100)}
                            onChange={(event) =>
                              updateProfile(index, { influence: Number(event.target.value) / 100 })
                            }
                            className="h-1 flex-1 accent-amber"
                          />
                          <span className="num w-8 text-right text-paper">
                            {pct(profile.influence)}
                          </span>
                        </label>
                        <label className="flex flex-1 items-center gap-2">
                          强度
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(profile.stance.intensity * 100)}
                            onChange={(event) =>
                              updateProfile(index, {
                                stance: {
                                  ...profile.stance,
                                  intensity: Number(event.target.value) / 100,
                                },
                              })
                            }
                            className="h-1 flex-1 accent-amber"
                          />
                          <span className="num w-8 text-right text-paper">
                            {pct(profile.stance.intensity)}
                          </span>
                        </label>
                      </div>
                    </div>
                  ))}
                  {preview ? (
                    <p className="pt-1 text-[10px] leading-relaxed text-paper-muted/70">
                      生成只是草稿。姓名、身份、立场与权重可改；台词风格会跟随种子。
                    </p>
                  ) : null}
                </div>
              ) : null}

              <SandboxButton
                variant="primary"
                className="w-full"
                busy={creating}
                disabled={generating || !pack}
                onClick={handleCreate}
              >
                <MapIcon size={15} />
                建立世界并进入
              </SandboxButton>
              <p className="text-[10px] leading-relaxed text-paper-muted/70">
                建立后写入本地 SQLite；跑满后仍可回放、采访与分叉，不会自动清空。
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
          <h2 className="font-display text-2xl tracking-tight text-paper">世界档案</h2>
          <div className="flex items-center gap-3">
            <span className="num text-[10px] text-paper-muted">
              {worlds === null ? "读取中" : `${worlds.length} 个世界`}
            </span>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setWorlds(null);
                sandboxApi
                  .worlds()
                  .then(setWorlds)
                  .catch((error: unknown) => {
                    setLoadError(typedError(error));
                    setWorlds([]);
                  });
              }}
              className="text-[10px] uppercase tracking-[0.16em] text-paper-muted transition-colors hover:text-paper"
            >
              刷新
            </button>
          </div>
        </div>

        {loadError ? <ErrorBanner message={loadError} /> : null}

        {worlds === null ? (
          <div className="flex items-center gap-2 border-y border-ink-line/70 py-10 text-xs text-paper-muted">
            <Spinner /> 正在打开档案柜…
          </div>
        ) : worlds.length === 0 ? (
          <div className="border-y border-ink-line/70 py-14 text-center">
            <p className="font-display text-xl text-paper">这里还没有世界。</p>
            <p className="mt-2 text-xs text-paper-muted">
              从右边的种子开始，或者导入一份已跑过的世界继续看。
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <a
                href="#create"
                className="inline-flex h-9 items-center gap-2 rounded-sm bg-amber px-3 text-xs font-medium text-ink"
              >
                <PlusIcon size={14} /> 造第一个世界
              </a>
              <SandboxButton size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
                <UploadIcon size={14} /> 导入
              </SandboxButton>
            </div>
          </div>
        ) : (
          <div className="border-t border-ink-line/70">
            {worlds.map((world) => (
              <WorldRow key={world.id} world={world} />
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[10px] text-paper-muted/60">
          <span className="flex items-center gap-2">
            <ForkIcon size={12} />
            分叉保留 1–N 轮原始事件，之后各自演化。
          </span>
          <span className="num">IFSS · LOCAL REALITY BENCH</span>
        </div>
      </section>

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="导入已跑世界"
        description="粘贴 /worlds/:id/export 的 JSON，或直接选择文件。导入后 seq 会重新编号，回放与采访照常。"
        footer={
          <>
            <SandboxButton variant="ghost" onClick={() => setImportOpen(false)}>
              取消
            </SandboxButton>
            <SandboxButton
              variant="primary"
              busy={importing}
              disabled={!importText.trim()}
              onClick={() => void importPayload(importText)}
            >
              <UploadIcon size={14} />
              导入
            </SandboxButton>
          </>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <SandboxButton size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          选择 JSON 文件
        </SandboxButton>
        <textarea
          className={`${inputClass} min-h-48 resize-y font-mono text-[11px] leading-relaxed`}
          placeholder='{"version":1,"world":{…}}'
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
        />
      </Dialog>
    </div>
  );
}
