import {
  type AgentBeliefSummary,
  type AgentProfile,
  roundToRoundEnd,
  type SandboxMetrics,
} from "@ifss/shared";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { AgentEntity } from "../entities/agent.entity";
import { AgentSnapshotEntity } from "../entities/agent-snapshot.entity";
import { CallEntity } from "../entities/call.entity";
import { DeliveryEntity } from "../entities/delivery.entity";
import { EventEntity } from "../entities/event.entity";
import { RoundEntity } from "../entities/round.entity";
import { WorldEntity } from "../entities/world.entity";
import { BudgetExceeded } from "../llm/budget";
import { LlmService } from "../llm/llm.service";
import { buildCompactPrompt } from "../prompts/compact";
import { SandboxRuntime } from "../runtime";
import { ActorService, type ActResult } from "./actor";
import { planDelivery } from "./delivery";
import { deriveRandom, type FeedCandidate, type FeedItem, scoreFeed } from "./feed";
import { applyGate } from "./gate";
import { updateMemory } from "./memory";
import { computeMetrics, type MetricsEvent } from "./metrics";
import { buildSchedule } from "./scheduler";
import { WorldService } from "./world";

const POST_QUOTA = 2;
const COMPACT_LIMIT = 24;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function mentionsOf(text: string | null, agents: AgentProfile[], selfId: string): string[] {
  if (!text) {
    return [];
  }
  const names = [...text.matchAll(/@([\w\u4e00-\u9fa5]+)/g)].map((match) => match[1]);
  const ids = new Set<string>();
  for (const name of names) {
    const found = agents.find((agent) => agent.name === name || agent.id === name);
    if (found && found.id !== selfId) {
      ids.add(found.id);
    }
  }
  return [...ids];
}

function summarizeRound(
  profiles: AgentProfile[],
  activeIds: string[],
  spokeIds: string[],
  events: EventEntity[],
  round: number,
): SandboxMetrics {
  const silentIds = activeIds.filter((id) => !spokeIds.includes(id));
  return computeMetrics({
    round,
    agents: profiles,
    activeIds,
    silentIds,
    events: events.map(
      (event): MetricsEvent => ({
        seq: event.seq,
        round: event.round,
        kind: event.kind,
        actorId: event.actorId,
        targetId: event.targetId,
        content: event.content ?? "",
        emotion: event.payload?.emotion,
        mentions: event.payload?.mentions,
      }),
    ),
  });
}

@Injectable()
export class LoopService {
  private readonly running = new Set<string>();
  private readonly stopRequests = new Set<string>();
  private readonly tasks = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(AgentEntity)
    private readonly agents: Repository<AgentEntity>,
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
    @InjectRepository(DeliveryEntity)
    private readonly deliveries: Repository<DeliveryEntity>,
    @InjectRepository(AgentSnapshotEntity)
    private readonly snapshots: Repository<AgentSnapshotEntity>,
    @InjectRepository(CallEntity)
    private readonly calls: Repository<CallEntity>,
    private readonly actor: ActorService,
    private readonly llm: LlmService,
    private readonly worldService: WorldService,
    private readonly runtime: SandboxRuntime,
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async start(worldId: string, rounds?: number): Promise<{ endRound: number }> {
    const world = await this.worldService.get(worldId);
    if (this.running.has(worldId) || world.status === "running") {
      throw new ConflictException("这个世界正在运行");
    }
    if (world.status === "done") {
      throw new BadRequestException("世界已跑完，请先分叉");
    }
    const endRound = Math.min(
      world.totalRounds,
      world.currentRound + Math.max(1, rounds ?? world.totalRounds),
    );
    if (endRound <= world.currentRound) {
      throw new BadRequestException("没有可运行的轮次");
    }

    this.running.add(worldId);
    this.stopRequests.delete(worldId);
    await this.worldService.updateWorld(world, { status: "running", errorText: null });
    this.runtime.publish(worldId, {
      type: "snapshot",
      data: await this.worldService.snapshot(worldId),
    });

    const task = this.execute(worldId, endRound)
      .catch((error: unknown) => {
        this.logger.errorWithFields("世界运行异常退出", {
          worldId,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.running.delete(worldId);
        this.tasks.delete(worldId);
      });
    this.tasks.set(worldId, task);
    return { endRound };
  }

  stop(worldId: string): { stopping: boolean } {
    if (!this.running.has(worldId)) {
      throw new ConflictException("这个世界没有在运行");
    }
    this.stopRequests.add(worldId);
    return { stopping: true };
  }

  whenIdle(worldId: string): Promise<void> {
    return this.tasks.get(worldId) ?? Promise.resolve();
  }

  private async execute(worldId: string, endRound: number): Promise<void> {
    let world = await this.worldService.get(worldId);
    let current = world.currentRound;
    let failure: string | null = null;
    let consecutiveAllFailed = 0;
    let stopped = false;

    try {
      while (current < endRound) {
        if (this.stopRequests.has(worldId)) {
          break;
        }
        const round = current + 1;
        const result = await this.runRound(world, round);
        current = round;
        await this.worldService.updateWorld(world, { currentRound: round });
        this.runtime.publish(worldId, roundToRoundEnd(result.round));

        if (result.allFailed) {
          consecutiveAllFailed += 1;
          if (consecutiveAllFailed >= 2) {
            failure = "模型连续两轮全部失败，已暂停";
            break;
          }
        } else {
          consecutiveAllFailed = 0;
        }
        world = { ...world, currentRound: round };
      }
    } catch (error) {
      failure =
        error instanceof BudgetExceeded
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      this.logger.errorWithFields("世界本轮中止", { worldId, round: current, failure });
      this.runtime.publish(worldId, {
        type: "error",
        data: {
          round: current,
          code: error instanceof BudgetExceeded ? "budget" : "run_failed",
          message: failure,
        },
      });
    } finally {
      stopped = this.stopRequests.has(worldId);
      this.stopRequests.delete(worldId);
    }

    const status = failure || stopped ? "paused" : current >= world.totalRounds ? "done" : "ready";
    await this.worldService.updateWorld(world, {
      currentRound: current,
      status,
      errorText: failure,
    });
    // 结束后补一帧权威快照，否则前端只能看到 running，无法恢复操作按钮。
    this.runtime.publish(worldId, {
      type: "snapshot",
      data: await this.worldService.snapshot(worldId),
    });
    if (status === "done") {
      this.runtime.publish(worldId, { type: "done", data: { rounds: current } });
    }
    this.logger.info("世界运行结束", { worldId, currentRound: current, status, failure });
  }

  private async runRound(
    world: WorldEntity,
    round: number,
  ): Promise<{ round: RoundEntity; allFailed: boolean }> {
    const entities = await this.agents.find({
      where: { worldId: world.id },
      order: { agentId: "ASC" },
    });
    if (entities.length === 0) {
      throw new Error("世界没有角色");
    }
    const profiles = entities.map((entity) => entity.profile);
    const previous = await this.events.find({
      where: { worldId: world.id, round: round - 1 },
      order: { seq: "ASC" },
    });

    const schedule = buildSchedule({
      agents: profiles,
      round,
      seed: world.rngSeed,
      timeSlots: world.seed.timeSlots,
      previousEvents: previous.map((event) => ({
        round: event.round,
        kind: event.kind,
        actorId: event.actorId,
        targetId: event.targetId,
        mentions: event.payload?.mentions ?? [],
      })),
    });
    const activeIds = schedule.activeIds;
    const activeSet = new Set(activeIds);

    const injected = await this.deliverInterventions(world, round, activeIds, profiles);

    const priorEvents = (
      await this.events.find({ where: { worldId: world.id }, order: { seq: "ASC" } })
    ).filter((event) => event.round < round);
    const allDeliveries = await this.deliveries.find({ where: { worldId: world.id } });

    const feedByAgent = new Map<string, FeedItem[]>();
    const injectionsByAgent = new Map<string, string[]>();
    for (const entity of entities) {
      if (!activeSet.has(entity.agentId)) {
        continue;
      }
      const rows = allDeliveries.filter((row) => row.agentId === entity.agentId);
      feedByAgent.set(
        entity.agentId,
        this.buildFeed(
          profiles,
          entity.agentId,
          rows.filter((row) => row.seenRound < round),
          priorEvents,
          round,
          world.rngSeed,
        ),
      );
      injectionsByAgent.set(
        entity.agentId,
        rows
          .filter((row) => row.seenRound === round)
          .map((row) => injected.find((item) => item.seq === row.eventSeq))
          .filter((event): event is EventEntity => event !== undefined)
          .map((event) => event.content ?? ""),
      );
    }

    let cursor = 0;
    const gate = applyGate(
      activeIds.map((agentId) => {
        const entity = entities.find((item) => item.agentId === agentId) as AgentEntity;
        return {
          agent: { profile: entity.profile, state: entity.state },
          feed: (feedByAgent.get(agentId) ?? []).map((item) => ({
            relevance: item.relevance,
            mentionsAgent: item.mentionsMe,
            repliesToAgent: item.repliesToMe,
          })),
          round,
          gateCoefficient: world.seed.gateCoefficient,
        };
      }),
      () => {
        cursor += 1;
        return deriveRandom(world.rngSeed, "gate", round * 1000 + cursor);
      },
    );
    const asked = activeIds.filter((id) => !gate.gated.includes(id));

    this.runtime.publish(world.id, {
      type: "round_start",
      data: { round, timeLabel: schedule.timeLabel, activeIds, gatedIds: gate.gated },
    });

    const maxConcurrency = this.config.get<number>("sandbox.maxConcurrency") ?? 6;
    const decisions = await mapLimit(asked, maxConcurrency, async (agentId) => {
      const entity = entities.find((item) => item.agentId === agentId) as AgentEntity;
      return {
        agentId,
        result: await this.actor.decide({
          worldId: world.id,
          agent: {
            agentId,
            profile: entity.profile,
            belief: entity.belief,
            memory: entity.memory,
            state: entity.state,
          } satisfies AgentBeliefSummary,
          feed: feedByAgent.get(agentId) ?? [],
          agents: profiles,
          round,
          timeLabel: schedule.timeLabel,
          scene: world.seed.scene,
          postCount: this.postCount(priorEvents, agentId, round),
          postQuota: POST_QUOTA,
          injections: injectionsByAgent.get(agentId) ?? [],
        }),
      };
    });
    const decisionMap = new Map(decisions.map((item) => [item.agentId, item.result]));

    const ordered = [...asked].sort((left, right) => {
      const leftAgent = profiles.find((profile) => profile.id === left) as AgentProfile;
      const rightAgent = profiles.find((profile) => profile.id === right) as AgentProfile;
      return rightAgent.influence - leftAgent.influence || left.localeCompare(right);
    });

    const spokeIds: string[] = [];
    const roundEvents: EventEntity[] = [];
    const roundDeliveries: DeliveryEntity[] = [];

    for (const agentId of ordered) {
      const decision = decisionMap.get(agentId) as ActResult;
      const action = decision.action;
      if (action.action === "ignore") {
        continue;
      }
      const targetLast =
        action.target_id !== null
          ? [...priorEvents, ...roundEvents]
              .filter((event) => event.actorId === action.target_id)
              .at(-1)
          : undefined;
      const threadId =
        action.action === "post"
          ? null
          : (targetLast?.payload?.thread_id ?? targetLast?.seq ?? null);
      const mentions = mentionsOf(action.text, profiles, agentId);

      const saved = await this.events.save({
        worldId: world.id,
        round,
        kind: action.action,
        actorId: agentId,
        targetId: action.action === "post" ? null : action.target_id,
        content: action.text,
        payload: {
          emotion: action.emotion,
          private_reason: action.private_reason,
          thread_id: threadId ?? undefined,
          mentions,
          ...(decision.quotaViolation ? { quota_violation: true } : {}),
        },
        visibility: "public",
        createdAt: new Date().toISOString(),
      });

      if (action.action === "post") {
        saved.payload = { ...(saved.payload ?? {}), thread_id: saved.seq };
        await this.events.save(saved);
      }

      const plan = planDelivery({
        seq: saved.seq,
        round,
        kind: action.action,
        actorId: agentId,
        targetId: saved.targetId,
        mentions,
        activeIds,
        allAgentIds: profiles.map((item) => item.id),
        visibility: "public",
      });
      if (plan.deliveries.length > 0) {
        await this.deliveries.save(
          plan.deliveries.map((entry) => ({ ...entry, worldId: world.id })),
        );
        roundDeliveries.push(...plan.deliveries.map((entry) => ({ ...entry, worldId: world.id })));
      }
      roundEvents.push(saved);
      if (action.action === "post" || action.action === "reply") {
        spokeIds.push(agentId);
      }

      this.runtime.publish(world.id, {
        type: "action",
        data: {
          seq: saved.seq,
          round,
          kind: action.action,
          actorId: agentId,
          targetId: saved.targetId,
          content: action.text ?? "",
          emotion: action.emotion,
        },
      });
    }

    const updatedAgents = await this.updateAgents(
      round,
      entities,
      profiles,
      activeSet,
      spokeIds,
      roundEvents,
      roundDeliveries,
      allDeliveries,
      injected,
    );

    await this.compactMemories(world, round, profiles, activeSet, updatedAgents);
    await this.agents.save(updatedAgents);

    const silentIds = activeIds.filter((id) => !spokeIds.includes(id));
    const metrics = summarizeRound(
      profiles,
      activeIds,
      spokeIds,
      [...priorEvents, ...roundEvents],
      round,
    );

    const roundRecord: RoundEntity = {
      worldId: world.id,
      round,
      timeLabel: schedule.timeLabel,
      activeIds,
      spokeIds,
      silentIds,
      gatedIds: gate.gated,
      metrics,
    };
    await this.worldService.saveRound(roundRecord);
    await this.snapshots.save(
      updatedAgents.map((agent) => ({
        worldId: world.id,
        round,
        agentId: agent.agentId,
        belief: agent.belief,
        memory: agent.memory,
        state: agent.state,
      })),
    );

    const allFailed =
      asked.length > 0 && decisions.every((item) => item.result.failed && !item.result.ok);
    this.logger.info("轮次完成", {
      worldId: world.id,
      round,
      active: activeIds.length,
      gated: gate.gated.length,
      spoke: spokeIds.length,
      silent: silentIds.length,
      events: roundEvents.length,
    });
    return { round: roundRecord, allFailed };
  }

  private buildFeed(
    profiles: AgentProfile[],
    agentId: string,
    rows: DeliveryEntity[],
    events: EventEntity[],
    round: number,
    seed: number,
  ): FeedItem[] {
    const profile = profiles.find((item) => item.id === agentId) as AgentProfile;
    const eventMap = new Map(events.map((event) => [event.seq, event]));
    const byAgent = new Map(profiles.map((item) => [item.id, item]));

    const counts = new Map<
      number,
      { likes: number; replies: number; lastReplyRound: number | null }
    >();
    const lastByActor = new Map<string, EventEntity>();
    for (const event of events) {
      if (event.actorId) {
        lastByActor.set(event.actorId, event);
      }
      if (event.targetId === null || (event.kind !== "like" && event.kind !== "reply")) {
        continue;
      }
      const target = lastByActor.get(event.targetId);
      if (!target) {
        continue;
      }
      const current = counts.get(target.seq) ?? { likes: 0, replies: 0, lastReplyRound: null };
      if (event.kind === "like") {
        current.likes += 1;
      } else {
        current.replies += 1;
        current.lastReplyRound = Math.max(current.lastReplyRound ?? 0, event.round);
      }
      counts.set(target.seq, current);
    }

    const candidates: FeedCandidate[] = rows
      .map((row) => eventMap.get(row.eventSeq))
      .filter((event): event is EventEntity => event !== undefined)
      .filter((event) => event.actorId === null || byAgent.has(event.actorId))
      .filter(
        (event) =>
          event.kind === "post" ||
          event.kind === "reply" ||
          event.kind === "system" ||
          event.kind === "intervention",
      )
      .map((event) => {
        const actor = event.actorId ? byAgent.get(event.actorId) : undefined;
        const stats = counts.get(event.seq) ?? { likes: 0, replies: 0, lastReplyRound: null };
        return {
          seq: event.seq,
          round: event.round,
          kind: event.kind,
          actorId: event.actorId ?? "",
          targetId: event.targetId,
          content: event.content ?? "",
          threadId: event.payload?.thread_id ?? event.seq,
          likes: stats.likes,
          replies: stats.replies,
          lastReplyRound: stats.lastReplyRound,
          actorPosition: actor?.stance.position ?? "neutral",
          actorInfluence: actor?.influence ?? 0,
          mentionsMe: event.payload?.mentions?.includes(agentId) ?? false,
          repliesToMe: event.kind === "reply" && event.targetId === agentId,
        } satisfies FeedCandidate;
      });

    return scoreFeed({ agent: profile, round, seed, candidates });
  }

  private postCount(events: EventEntity[], agentId: string, round: number): number {
    return events.filter(
      (event) =>
        event.kind === "post" &&
        event.actorId === agentId &&
        event.round > round - 4 &&
        event.round < round,
    ).length;
  }

  private async deliverInterventions(
    world: WorldEntity,
    round: number,
    activeIds: string[],
    profiles: AgentProfile[],
  ): Promise<EventEntity[]> {
    const all = await this.events.find({
      where: { worldId: world.id, kind: "intervention" },
      order: { seq: "ASC" },
    });
    if (all.length === 0) {
      return [];
    }
    const deliveries = await this.deliveries.find({ where: { worldId: world.id } });
    const delivered = new Set(deliveries.map((row) => row.eventSeq));
    const cancelEvents = await this.events.find({ where: { worldId: world.id, kind: "system" } });
    const cancelled = new Set(
      cancelEvents
        .map((event) => event.payload?.cancelled)
        .filter((value): value is number => typeof value === "number"),
    );

    const fresh = all.filter(
      (event) => event.round <= round && !delivered.has(event.seq) && !cancelled.has(event.seq),
    );
    if (fresh.length === 0) {
      return [];
    }

    for (const event of fresh) {
      const plan = planDelivery({
        seq: event.seq,
        round,
        kind: "intervention",
        actorId: event.actorId,
        targetId: event.targetId,
        mentions: [],
        activeIds,
        allAgentIds: profiles.map((profile) => profile.id),
        visibility: event.visibility,
      });
      if (plan.deliveries.length === 0) {
        continue;
      }
      await this.deliveries.save(plan.deliveries.map((entry) => ({ ...entry, worldId: world.id })));
      this.runtime.publish(world.id, {
        type: "intervention",
        data: {
          seq: event.seq,
          round,
          visibility: event.visibility,
          content: event.content ?? "",
          kind: "intervention",
          actorId: null,
          targetId: event.targetId,
          delivered: true,
        },
      });
    }
    return fresh;
  }

  private async updateAgents(
    round: number,
    entities: AgentEntity[],
    profiles: AgentProfile[],
    activeSet: Set<string>,
    spokeIds: string[],
    roundEvents: EventEntity[],
    roundDeliveries: DeliveryEntity[],
    allDeliveries: DeliveryEntity[],
    injected: EventEntity[],
  ): Promise<AgentEntity[]> {
    const eventMap = new Map<number, EventEntity>();
    for (const event of [...roundEvents, ...injected]) {
      eventMap.set(event.seq, event);
    }

    return entities.map((entity) => {
      if (!activeSet.has(entity.agentId)) {
        return entity;
      }
      const seenRows = [
        ...roundDeliveries,
        ...allDeliveries.filter((row) => row.seenRound === round),
      ].filter((row) => row.agentId === entity.agentId);
      const seen = [...new Map(seenRows.map((row) => [row.eventSeq, row])).values()]
        .map((row) => {
          const event = eventMap.get(row.eventSeq);
          return event
            ? { seq: event.seq, content: event.content ?? "", salience: row.salience }
            : null;
        })
        .filter(
          (event): event is { seq: number; content: string; salience: number } => event !== null,
        );

      const incoming = roundEvents
        .filter(
          (event) =>
            event.targetId === entity.agentId && (event.kind === "reply" || event.kind === "like"),
        )
        .map((event) => ({
          kind: event.kind as "reply" | "like",
          actorId: event.actorId as string,
          mentionsAgent: event.payload?.mentions?.includes(entity.agentId) ?? false,
        }));

      const updated = updateMemory({
        profile: entity.profile,
        agents: profiles,
        belief: entity.belief,
        memory: entity.memory,
        state: entity.state,
        round,
        active: true,
        spoke: spokeIds.includes(entity.agentId),
        seenEvents: seen,
        incoming,
      });
      return { ...entity, ...updated };
    });
  }

  private async compactMemories(
    world: WorldEntity,
    round: number,
    profiles: AgentProfile[],
    activeSet: Set<string>,
    agents: AgentEntity[],
  ): Promise<void> {
    const used = await this.calls.count({ where: { worldId: world.id, purpose: "compact" } });
    if (used >= COMPACT_LIMIT) {
      return;
    }
    const candidates = agents.filter(
      (agent) => activeSet.has(agent.agentId) && agent.memory.recent.length > 12,
    );
    if (round % 4 === 0) {
      for (const agent of agents) {
        if (activeSet.has(agent.agentId) && !candidates.includes(agent)) {
          candidates.push(agent);
        }
      }
    }
    const budget = Math.min(candidates.length, COMPACT_LIMIT - used);
    const model = this.config.get<string>("sandbox.modelAct") ?? "claude-sonnet-5-5";

    await mapLimit(candidates.slice(0, budget), 6, async (agent) => {
      const profile = profiles.find((item) => item.id === agent.agentId);
      if (!profile) {
        return;
      }
      try {
        const result = await this.llm.complete({
          worldId: world.id,
          round,
          agentId: agent.agentId,
          purpose: "compact",
          model,
          prompt: buildCompactPrompt({ profile, memory: agent.memory }),
          maxTokens: 400,
          temperature: 0.4,
        });
        agent.memory = { ...agent.memory, summary: result.raw.trim().slice(0, 200) };
      } catch (error) {
        if (error instanceof BudgetExceeded) {
          throw error;
        }
        this.logger.warnWithFields("记忆压缩失败，保留旧摘要", {
          worldId: world.id,
          agentId: agent.agentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}
