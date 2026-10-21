import { randomInt, randomUUID } from "node:crypto";
import {
  type AgentBelief,
  type AgentBeliefSummary,
  type AgentMemory,
  type AgentProfile,
  AgentProfileSchema,
  type AgentState,
  type PendingIntervention,
  type RoundRecord,
  type SandboxEvent,
  type SandboxMetrics,
  type SeedConfig,
  WORLD_MAX_ROUNDS,
  WORLD_MIN_ROUNDS,
  type WorldRecord,
  type WorldSnapshot,
} from "@ifss/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { AgentEntity } from "../entities/agent.entity";
import { AgentSnapshotEntity } from "../entities/agent-snapshot.entity";
import { CallEntity } from "../entities/call.entity";
import { DeliveryEntity } from "../entities/delivery.entity";
import { EventEntity } from "../entities/event.entity";
import { RoundEntity } from "../entities/round.entity";
import { WorldEntity } from "../entities/world.entity";
import { promptHashOf } from "../llm/llm.service";
import { PacksService } from "./packs";

export type CreateCast = "preset" | AgentProfile[];

export interface CreateWorldInput {
  packId?: string;
  seedText?: string;
  totalRounds?: number;
  cast: CreateCast;
}

export interface CreateInterventionInput {
  content: string;
  visibility?: string;
  effectiveRound?: number;
  mode?: string;
}

export interface ForkInput {
  atRound: number;
  intervention?: { content?: string; visibility?: string };
}

interface WorldExport {
  version: number;
  world: WorldEntity;
  agents: AgentEntity[];
  events: EventEntity[];
  deliveries: DeliveryEntity[];
  rounds: RoundEntity[];
  calls: CallEntity[];
  snapshots: AgentSnapshotEntity[];
}

/** 种子首行常是【群名】版头，跳过它，别把群名当成初始事实。 */
function firstSentence(text: string): string {
  const content =
    text
      .trim()
      .split(/[。！？!?\n]/)
      .map((part) => part.trim())
      .find((part) => part.length > 0 && !/^【[^】]{0,40}】$/.test(part)) ?? text.trim();
  return content.slice(0, 40);
}

function initialBelief(fact: string, ref: number): AgentBelief {
  return { known: [{ fact, ref }], unknown: [], relations: {}, summary: fact };
}

function initialMemory(fact: string, ref: number): AgentMemory {
  return {
    summary: "",
    recent: [{ round: 0, kind: "saw", ref, gist: fact.slice(0, 30), salience: 0.9 }],
  };
}

function initialState(): AgentState {
  return {
    mood: { label: "平静", intensity: 0.3 },
    last_spoke_round: null,
    silent_rounds: 0,
    actions_total: 0,
    spoke_streak: 0,
  };
}

function toWorldRecord(entity: WorldEntity): WorldRecord {
  return {
    id: entity.id,
    parentId: entity.parentId,
    forkRound: entity.forkRound,
    title: entity.title,
    packId: entity.packId,
    seed: entity.seed,
    castSource: entity.castSource,
    rngSeed: entity.rngSeed,
    currentRound: entity.currentRound,
    totalRounds: entity.totalRounds,
    status: entity.status,
    errorText: entity.errorText,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toAgentSummary(entity: AgentEntity): AgentBeliefSummary {
  return {
    agentId: entity.agentId,
    profile: entity.profile,
    belief: entity.belief,
    memory: entity.memory,
    state: entity.state,
  };
}

function toEvent(entity: EventEntity): SandboxEvent {
  return {
    seq: entity.seq,
    worldId: entity.worldId,
    round: entity.round,
    kind: entity.kind,
    actorId: entity.actorId,
    targetId: entity.targetId,
    content: entity.content,
    payload: entity.payload,
    visibility: entity.visibility,
    createdAt: entity.createdAt,
  };
}

function toRound(entity: RoundEntity): RoundRecord {
  return {
    worldId: entity.worldId,
    round: entity.round,
    timeLabel: entity.timeLabel,
    activeIds: entity.activeIds,
    spokeIds: entity.spokeIds,
    silentIds: entity.silentIds,
    gatedIds: entity.gatedIds,
    metrics: entity.metrics,
  };
}

function remapBelief(belief: AgentBelief, seqMap: Map<number, number>): AgentBelief {
  return {
    ...belief,
    known: belief.known.map((item) => ({
      ...item,
      ref: item.ref === null ? null : (seqMap.get(item.ref) ?? null),
    })),
  };
}

function remapMemory(memory: AgentMemory, seqMap: Map<number, number>): AgentMemory {
  return {
    ...memory,
    recent: memory.recent.map((item) => ({
      ...item,
      ref: item.ref === null ? null : (seqMap.get(item.ref) ?? null),
    })),
  };
}

@Injectable()
export class WorldService {
  constructor(
    @InjectRepository(WorldEntity)
    private readonly worlds: Repository<WorldEntity>,
    @InjectRepository(AgentEntity)
    private readonly agents: Repository<AgentEntity>,
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
    @InjectRepository(DeliveryEntity)
    private readonly deliveries: Repository<DeliveryEntity>,
    @InjectRepository(RoundEntity)
    private readonly rounds: Repository<RoundEntity>,
    @InjectRepository(CallEntity)
    private readonly calls: Repository<CallEntity>,
    @InjectRepository(AgentSnapshotEntity)
    private readonly snapshots: Repository<AgentSnapshotEntity>,
    private readonly dataSource: DataSource,
    private readonly packs: PacksService,
    private readonly logger: AppLoggerService,
  ) {}

  async create(input: CreateWorldInput): Promise<{ id: string }> {
    const pack = this.packs.find(input.packId);
    if (input.packId && !pack) {
      throw new NotFoundException(`种子包不存在：${input.packId}`);
    }
    if (input.cast === "preset" && !pack) {
      throw new BadRequestException("使用预置角色时必须指定 packId");
    }

    const seedText = input.seedText?.trim() || pack?.seed.text;
    if (!seedText) {
      throw new BadRequestException("seedText 与 packId 至少提供一个");
    }

    const profiles = this.resolveCast(input.cast, pack, seedText);
    const seed: SeedConfig = {
      text: seedText,
      scene: pack?.seed.scene ?? "自定义场景",
      timeSlots: pack?.seed.timeSlots ?? ["09:00", "14:00", "21:00", "次日 08:00"],
      gateCoefficient: pack?.seed.gateCoefficient ?? 1,
      renderMode: "chat",
    };
    const totalRounds = Math.min(
      WORLD_MAX_ROUNDS,
      Math.max(WORLD_MIN_ROUNDS, input.totalRounds ?? pack?.recommendedRounds ?? WORLD_MIN_ROUNDS),
    );
    const id = randomUUID();
    const now = new Date().toISOString();
    const fact = firstSentence(seedText);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(WorldEntity, {
        id,
        parentId: null,
        forkRound: null,
        title: pack?.name ?? seedText.split("\n")[0]?.slice(0, 24) ?? "未命名世界",
        packId: pack?.id ?? "custom",
        seed,
        castSource: input.cast === "preset" ? "preset" : "generated",
        rngSeed: randomInt(1, 2_147_483_647),
        currentRound: 0,
        totalRounds,
        status: "ready",
        errorText: null,
        createdAt: now,
        updatedAt: now,
      });

      const seedEvent = await manager.save(EventEntity, {
        worldId: id,
        round: 0,
        kind: "system",
        actorId: null,
        targetId: null,
        content: seedText,
        payload: null,
        visibility: "public",
        createdAt: now,
      });

      await manager.save(
        AgentEntity,
        profiles.map((profile) => ({
          worldId: id,
          agentId: profile.id,
          profile,
          belief: initialBelief(fact, seedEvent.seq),
          memory: initialMemory(fact, seedEvent.seq),
          state: initialState(),
        })),
      );

      await manager.save(
        DeliveryEntity,
        profiles.map((profile) => ({
          worldId: id,
          eventSeq: seedEvent.seq,
          agentId: profile.id,
          seenRound: 0,
          salience: 0.9,
        })),
      );
    });

    this.logger.info("世界创建完成", {
      worldId: id,
      packId: pack?.id ?? "custom",
      agents: profiles.length,
      totalRounds,
    });
    return { id };
  }

  private resolveCast(
    cast: CreateCast,
    pack: ReturnType<PacksService["find"]>,
    seedText: string,
  ): AgentProfile[] {
    if (cast === "preset") {
      return (pack?.initialCast ?? []).map((profile) => ({
        ...profile,
        goals: [...profile.goals],
        fears: [...profile.fears],
        can_see: [...profile.can_see],
        activity: { ...profile.activity, hours: [...profile.activity.hours] },
      }));
    }
    if (!Array.isArray(cast) || cast.length === 0) {
      throw new BadRequestException("cast 必须是非空角色卡数组");
    }
    if (cast.length > 20) {
      throw new BadRequestException("角色数不能超过 20");
    }
    const ids = new Set<string>();
    return cast.map((raw) => {
      const parsed = AgentProfileSchema.safeParse(raw);
      if (!parsed.success) {
        throw new BadRequestException(
          `角色卡不合法：${parsed.error.issues.map((issue) => issue.message).join("；")}`,
        );
      }
      if (ids.has(parsed.data.id)) {
        throw new BadRequestException(`角色 id 重复：${parsed.data.id}`);
      }
      ids.add(parsed.data.id);
      if (!parsed.data.stance.issue) {
        parsed.data.stance.issue = firstSentence(seedText);
      }
      return parsed.data;
    });
  }

  async list(): Promise<WorldRecord[]> {
    const rows = await this.worlds.find({ order: { createdAt: "DESC" } });
    return rows.map(toWorldRecord);
  }

  async get(worldId: string): Promise<WorldEntity> {
    const world = await this.worlds.findOne({ where: { id: worldId } });
    if (!world) {
      throw new NotFoundException(`世界不存在：${worldId}`);
    }
    return world;
  }

  async snapshot(worldId: string): Promise<WorldSnapshot> {
    const world = await this.get(worldId);
    const [agents, rounds, pendingInterventions] = await Promise.all([
      this.agents.find({ where: { worldId }, order: { agentId: "ASC" } }),
      this.rounds.find({ where: { worldId }, order: { round: "ASC" } }),
      this.pendingInterventions(worldId),
    ]);
    const metrics = rounds
      .filter((round) => round.metrics !== null)
      .map((round) => ({ round: round.round, ...(round.metrics as SandboxMetrics) }));

    return {
      world: toWorldRecord(world),
      agents: agents.map(toAgentSummary),
      rounds: rounds.map(toRound),
      metrics,
      pendingInterventions,
    };
  }

  async updateWorld(world: WorldEntity, patch: Partial<WorldEntity>): Promise<void> {
    await this.worlds.update({ id: world.id }, { ...patch, updatedAt: new Date().toISOString() });
  }

  async pendingInterventions(worldId: string): Promise<PendingIntervention[]> {
    const world = await this.get(worldId);
    const events = await this.events.find({
      where: { worldId, kind: "intervention" },
      order: { seq: "ASC" },
    });
    if (events.length === 0) {
      return [];
    }
    const systemEvents = await this.events.find({ where: { worldId, kind: "system" } });
    const cancelled = new Set(
      systemEvents
        .map((event) => event.payload?.cancelled)
        .filter((value): value is number => typeof value === "number"),
    );
    const delivered = new Set(
      (
        await this.deliveries.find({
          where: { worldId, eventSeq: In(events.map((event) => event.seq)) },
        })
      ).map((row) => row.eventSeq),
    );

    return events
      .filter((event) => {
        if (cancelled.has(event.seq)) {
          return false;
        }
        if (event.visibility === "all" || event.visibility === "public") {
          return event.round > world.currentRound;
        }
        return !delivered.has(event.seq);
      })
      .map((event) => ({
        seq: event.seq,
        round: event.round,
        visibility: event.visibility,
        content: event.content ?? "",
      }));
  }

  async createIntervention(
    worldId: string,
    input: CreateInterventionInput,
  ): Promise<{ seq: number; round: number }> {
    const world = await this.get(worldId);
    if (world.status === "done") {
      throw new BadRequestException("世界已跑完，请先分叉");
    }
    if (input.mode === "intent") {
      throw new BadRequestException("群聊场景只支持事实注入（mode=intent 不支持）");
    }
    const content = input.content?.trim();
    if (!content) {
      throw new BadRequestException("注入内容不能为空");
    }
    const visibility = input.visibility ?? "all";
    if (visibility !== "all") {
      const target = await this.agents.findOne({ where: { worldId, agentId: visibility } });
      if (!target) {
        throw new BadRequestException(`定向注入目标不存在：${visibility}`);
      }
    }
    const round = input.effectiveRound ?? world.currentRound + 1;
    if (round <= world.currentRound || round > world.totalRounds) {
      throw new BadRequestException(
        `生效轮次必须在 ${world.currentRound + 1}–${world.totalRounds} 之间`,
      );
    }

    const event = await this.events.save({
      worldId,
      round,
      kind: "intervention",
      actorId: null,
      targetId: visibility === "all" ? null : visibility,
      content: content.slice(0, 200),
      payload: null,
      visibility,
      createdAt: new Date().toISOString(),
    });

    return { seq: event.seq, round };
  }

  async cancelIntervention(worldId: string, seq: number): Promise<{ cancelled: boolean }> {
    const event = await this.events.findOne({ where: { worldId, seq } });
    if (event?.kind !== "intervention") {
      throw new NotFoundException(`注入不存在：${seq}`);
    }
    const existing = await this.events.findOne({
      where: { worldId, kind: "system" },
    });
    void existing;
    const cancellations = await this.events.find({ where: { worldId, kind: "system" } });
    const already = cancellations.some((item) => item.payload?.cancelled === seq);
    if (already) {
      return { cancelled: true };
    }
    const delivered = await this.deliveries.count({ where: { worldId, eventSeq: seq } });
    if (delivered > 0) {
      throw new BadRequestException("该注入已经生效，无法撤回");
    }
    const world = await this.get(worldId);
    await this.events.save({
      worldId,
      round: world.currentRound,
      kind: "system",
      actorId: null,
      targetId: null,
      content: `撤回注入 #${seq}`,
      payload: { cancelled: seq },
      visibility: "public",
      createdAt: new Date().toISOString(),
    });
    return { cancelled: true };
  }

  async fork(worldId: string, input: ForkInput): Promise<{ id: string }> {
    const source = await this.get(worldId);
    if (source.status === "running") {
      throw new ConflictException("世界正在运行，停下来后再分叉");
    }
    const atRound = Math.trunc(input.atRound);
    if (!Number.isInteger(atRound) || atRound < 1 || atRound > source.currentRound) {
      throw new BadRequestException(`atRound 必须在 1–${source.currentRound} 之间`);
    }

    const newId = randomUUID();
    const now = new Date().toISOString();
    const rngSeed = Number.parseInt(
      promptHashOf(String(source.rngSeed), String(atRound)).slice(0, 8),
      16,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.save(WorldEntity, {
        ...source,
        id: newId,
        parentId: source.id,
        forkRound: atRound,
        currentRound: atRound,
        status: "ready",
        errorText: null,
        rngSeed,
        createdAt: now,
        updatedAt: now,
      });

      const sourceEvents = await manager.find(EventEntity, {
        where: { worldId: source.id },
        order: { seq: "ASC" },
      });
      const seqMap = new Map<number, number>();
      for (const event of sourceEvents.filter((item) => item.round <= atRound)) {
        const saved = await manager.save(EventEntity, {
          worldId: newId,
          round: event.round,
          kind: event.kind,
          actorId: event.actorId,
          targetId: event.targetId,
          content: event.content,
          payload: event.payload
            ? {
                ...event.payload,
                ...(typeof event.payload.thread_id === "number"
                  ? { thread_id: seqMap.get(event.payload.thread_id) ?? event.payload.thread_id }
                  : {}),
              }
            : null,
          visibility: event.visibility,
          createdAt: event.createdAt,
        });
        seqMap.set(event.seq, saved.seq);
      }

      const sourceAgents = await manager.find(AgentEntity, { where: { worldId: source.id } });
      const snapshots = await manager.find(AgentSnapshotEntity, {
        where: { worldId: source.id, round: atRound },
      });
      const snapMap = new Map(snapshots.map((item) => [item.agentId, item]));
      await manager.save(
        AgentEntity,
        sourceAgents.map((agent) => {
          const snap = snapMap.get(agent.agentId);
          return {
            worldId: newId,
            agentId: agent.agentId,
            profile: agent.profile,
            belief: remapBelief(snap?.belief ?? agent.belief, seqMap),
            memory: remapMemory(snap?.memory ?? agent.memory, seqMap),
            state: snap?.state ?? agent.state,
          };
        }),
      );

      const sourceDeliveries = await manager.find(DeliveryEntity, {
        where: { worldId: source.id },
      });
      const copiedDeliveries = sourceDeliveries
        .filter((row) => seqMap.has(row.eventSeq))
        .map((row) => ({
          worldId: newId,
          eventSeq: seqMap.get(row.eventSeq) as number,
          agentId: row.agentId,
          seenRound: row.seenRound,
          salience: row.salience,
        }));
      if (copiedDeliveries.length > 0) {
        await manager.save(DeliveryEntity, copiedDeliveries);
      }

      const sourceRounds = await manager.find(RoundEntity, {
        where: { worldId: source.id },
      });
      const copiedRounds = sourceRounds
        .filter((round) => round.round <= atRound)
        .map((round) => ({ ...round, worldId: newId }));
      if (copiedRounds.length > 0) {
        await manager.save(RoundEntity, copiedRounds);
      }

      const sourceSnapshots = await manager.find(AgentSnapshotEntity, {
        where: { worldId: source.id },
      });
      const copiedSnapshots = sourceSnapshots
        .filter((snap) => snap.round <= atRound)
        .map((snap) => ({
          ...snap,
          worldId: newId,
          belief: remapBelief(snap.belief, seqMap),
          memory: remapMemory(snap.memory, seqMap),
        }));
      if (copiedSnapshots.length > 0) {
        await manager.save(AgentSnapshotEntity, copiedSnapshots);
      }

      if (input.intervention?.content?.trim()) {
        await manager.save(EventEntity, {
          worldId: newId,
          round: atRound + 1,
          kind: "intervention",
          actorId: null,
          targetId: null,
          content: input.intervention.content.trim().slice(0, 200),
          payload: null,
          visibility: input.intervention.visibility ?? "all",
          createdAt: now,
        });
      }
    });

    this.logger.info("世界分叉完成", { parentId: source.id, worldId: newId, atRound });
    return { id: newId };
  }

  async exportWorld(worldId: string): Promise<WorldExport> {
    const world = await this.get(worldId);
    const [agents, events, deliveries, rounds, calls, snapshots] = await Promise.all([
      this.agents.find({ where: { worldId }, order: { agentId: "ASC" } }),
      this.events.find({ where: { worldId }, order: { seq: "ASC" } }),
      this.deliveries.find({ where: { worldId } }),
      this.rounds.find({ where: { worldId }, order: { round: "ASC" } }),
      this.calls.find({ where: { worldId } }),
      this.snapshots.find({ where: { worldId }, order: { round: "ASC" } }),
    ]);
    return { version: 1, world, agents, events, deliveries, rounds, calls, snapshots };
  }

  async importWorld(payload: WorldExport): Promise<{ id: string }> {
    if (
      !payload?.world?.seed?.text ||
      !Array.isArray(payload.agents) ||
      !Array.isArray(payload.events)
    ) {
      throw new BadRequestException("导入文件缺少 world/agents/events");
    }
    const newId = randomUUID();
    const now = new Date().toISOString();

    await this.dataSource.transaction(async (manager) => {
      const status = payload.world.status === "running" ? "paused" : payload.world.status;
      await manager.save(WorldEntity, {
        ...payload.world,
        id: newId,
        status,
        currentRound: Math.min(payload.world.currentRound, payload.world.totalRounds),
        createdAt: payload.world.createdAt ?? now,
        updatedAt: now,
      });

      const seqMap = new Map<number, number>();
      const events = [...payload.events].sort((a, b) => a.seq - b.seq);
      for (const event of events) {
        const saved = await manager.save(EventEntity, {
          worldId: newId,
          round: event.round,
          kind: event.kind,
          actorId: event.actorId,
          targetId: event.targetId,
          content: event.content,
          payload: event.payload
            ? {
                ...event.payload,
                ...(typeof event.payload.thread_id === "number"
                  ? { thread_id: seqMap.get(event.payload.thread_id) ?? event.payload.thread_id }
                  : {}),
              }
            : null,
          visibility: event.visibility,
          createdAt: event.createdAt,
        });
        seqMap.set(event.seq, saved.seq);
      }

      const agents = payload.agents.map((agent) => ({
        worldId: newId,
        agentId: agent.agentId,
        profile: agent.profile,
        belief: remapBelief(agent.belief, seqMap),
        memory: remapMemory(agent.memory, seqMap),
        state: agent.state,
      }));
      if (agents.length > 0) {
        await manager.save(AgentEntity, agents);
      }

      const deliveries = payload.deliveries
        .filter((row) => seqMap.has(row.eventSeq))
        .map((row) => ({ ...row, worldId: newId, eventSeq: seqMap.get(row.eventSeq) as number }));
      if (deliveries.length > 0) {
        await manager.save(DeliveryEntity, deliveries);
      }

      if (payload.rounds.length > 0) {
        await manager.save(
          RoundEntity,
          payload.rounds.map((round) => ({ ...round, worldId: newId })),
        );
      }

      if (payload.snapshots.length > 0) {
        await manager.save(
          AgentSnapshotEntity,
          payload.snapshots.map((snap) => ({
            ...snap,
            worldId: newId,
            belief: remapBelief(snap.belief, seqMap),
            memory: remapMemory(snap.memory, seqMap),
          })),
        );
      }

      if (payload.calls?.length > 0) {
        await manager.save(
          CallEntity,
          payload.calls.map((call) => ({ ...call, id: randomUUID(), worldId: newId })),
        );
      }
    });

    this.logger.info("世界导入完成", { worldId: newId, title: payload.world.title });
    return { id: newId };
  }

  async saveRound(round: RoundEntity): Promise<void> {
    await this.rounds.save(round);
  }

  async saveSnapshot(snapshot: AgentSnapshotEntity): Promise<void> {
    await this.snapshots.save(snapshot);
  }

  async eventsOf(worldId: string, round?: number): Promise<EventEntity[]> {
    return this.events.find({
      where: round === undefined ? { worldId } : { worldId, round },
      order: { seq: "ASC" },
    });
  }

  async eventList(worldId: string, round?: number): Promise<SandboxEvent[]> {
    return (await this.eventsOf(worldId, round)).map(toEvent);
  }

  /** 采访用：只返回该角色真正被交付过的事件。 */
  async visibleEvents(worldId: string, agentId: string): Promise<SandboxEvent[]> {
    const rows = await this.deliveries.find({ where: { worldId, agentId } });
    if (rows.length === 0) {
      return [];
    }
    const events = await this.events.find({
      where: { worldId, seq: In(rows.map((row) => row.eventSeq)) },
      order: { seq: "ASC" },
    });
    return events.map(toEvent);
  }
}
