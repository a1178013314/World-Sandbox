import { randomUUID } from "node:crypto";
import {
  type ForgePackResult,
  type PackConfig,
  PackConfigSchema,
  type PackSource,
  WORLD_MAX_ROUNDS,
  WORLD_MIN_ROUNDS,
} from "@ifss/shared";
import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { LlmService } from "../llm/llm.service";
import { buildForgePrompt } from "../prompts/forge";
import { RawProfileSchema, toAgentProfiles } from "./cast";
import { extractJson } from "./json";
import { PacksService } from "./packs";
import { SearchService } from "./search";

const DEFAULT_TIME_SLOTS = ["09:00", "14:00", "21:00", "次日 08:00"];
const SEARCH_LIMIT = 5;
const MAX_SOURCES = 8;

export const RawForgeSchema = z.object({
  name: z.string().trim().min(1),
  scene: z.string().trim().min(1),
  seedText: z.string().trim().min(1),
  timeSlots: z.array(z.string()).optional(),
  gateCoefficient: z.number().optional(),
  recommendedRounds: z.number().optional(),
  cast: z.array(RawProfileSchema).min(1),
});

export interface ForgePackInput {
  prompt: string;
  castSize?: number;
  totalRounds?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 种子首行常是【群名】版头，跳过它，别把群名当成议题。 */
function contentSentence(text: string): string {
  return (
    text
      .trim()
      .split(/[。！？!?\n]/)
      .map((part) => part.trim())
      .find((part) => part.length > 0 && !/^【[^】]{0,40}】$/.test(part)) ?? text.trim()
  );
}

function firstSentence(text: string): string {
  return contentSentence(text).slice(0, 40);
}

/** 时段必须带 HH:MM，否则 scheduler.hourOf 认不出来。 */
export function normalizeTimeSlots(raw: string[] | undefined): string[] {
  const slots = (raw ?? [])
    .map((slot) => slot.trim())
    .filter((slot) => /\d{1,2}:\d{2}/.test(slot))
    .slice(0, 4);
  return slots.length >= 2 ? slots : DEFAULT_TIME_SLOTS;
}

function hourOfSlot(label: string): number | null {
  const match = label.match(/(\d{1,2}):\d{2}/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

/**
 * 模型给的在线小时往往和 timeSlots 错开，导致整轮没人可发言。
 * 把每个人的小时映到最近的时段小时上，并保证至少有 2 个时段能上线。
 */
export function alignActivityHours(hours: number[], timeSlots: string[]): number[] {
  const slotHours = [...new Set(timeSlots.map(hourOfSlot).filter((hour) => hour !== null))];
  if (slotHours.length === 0) {
    return hours;
  }

  const mapped = new Set<number>();
  for (const hour of hours) {
    let best = slotHours[0] as number;
    for (const slot of slotHours) {
      if (Math.abs(slot - hour) < Math.abs(best - hour)) {
        best = slot;
      }
    }
    mapped.add(best);
  }
  for (const slot of slotHours) {
    if (mapped.size >= 2) {
      break;
    }
    mapped.add(slot);
  }
  return [...mapped].sort((a, b) => a - b).slice(0, 4);
}

function dedupeSources(hits: PackSource[]): PackSource[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.url)) {
      return false;
    }
    seen.add(hit.url);
    return true;
  });
}

/** 模型原始 JSON → 可注册的 PackConfig；纯函数，便于单测。 */
export function buildPackFromModel(
  raw: z.infer<typeof RawForgeSchema>,
  options: { castSize: number; recommendedRounds: number },
): PackConfig {
  const seedText = raw.seedText.trim().slice(0, 1200);
  const issue = firstSentence(seedText).slice(0, 30) || "当前议题";
  const timeSlots = normalizeTimeSlots(raw.timeSlots);
  // 一个世界只有一个议题：模型给歪了也拉回种子第一句，避免各说各的。
  const initialCast = toAgentProfiles(raw.cast, issue, options.castSize).map((profile) => ({
    ...profile,
    stance: { ...profile.stance, issue },
    activity: {
      ...profile.activity,
      hours: alignActivityHours(profile.activity.hours, timeSlots),
    },
  }));
  const pack: PackConfig = {
    id: `gen_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    name: raw.name.trim().slice(0, 40),
    renderMode: "chat",
    seed: {
      text: seedText,
      scene: raw.scene.trim().slice(0, 30),
      timeSlots,
      gateCoefficient: clamp(raw.gateCoefficient ?? 1, 0, 2),
    },
    recommendedRounds: clamp(
      Math.round(raw.recommendedRounds ?? options.recommendedRounds),
      WORLD_MIN_ROUNDS,
      WORLD_MAX_ROUNDS,
    ),
    initialCast,
  };
  return PackConfigSchema.parse(pack);
}

/**
 * 一句话 → 联网检索 → 一个可用的种子包。
 * 检索失败降级为直接生成；模型输出必须过 Zod，坏结果不注册。
 */
@Injectable()
export class PackForgeService {
  constructor(
    private readonly config: ConfigService,
    private readonly search: SearchService,
    private readonly llm: LlmService,
    private readonly packs: PacksService,
    private readonly logger: AppLoggerService,
  ) {}

  async forge(input: ForgePackInput): Promise<ForgePackResult> {
    const prompt = input.prompt.trim();
    // 一次调用写完种子 + 角色，8 人以上会明显变慢且人物变薄。
    const castSize = clamp(Math.trunc(input.castSize ?? 8), 3, 8);
    const recommendedRounds = clamp(
      Math.trunc(input.totalRounds ?? 12),
      WORLD_MIN_ROUNDS,
      WORLD_MAX_ROUNDS,
    );
    // fake provider 用于测试/断网演示，不触网检索，保证测试可重复。
    const offline = (this.config.get<string>("sandbox.provider") ?? "openai") === "fake";

    const outcomes = offline
      ? []
      : await Promise.all([
          this.search.search(prompt, SEARCH_LIMIT),
          this.search.search(`${prompt} 事件 背景 细节`, SEARCH_LIMIT),
        ]);
    const sources = dedupeSources(outcomes.flatMap((outcome) => outcome.hits)).slice(
      0,
      MAX_SOURCES,
    );
    const searchFailed =
      sources.length === 0 && outcomes.length > 0 && outcomes.every((outcome) => outcome.failed);

    const model = this.config.get<string>("sandbox.modelForge") ?? "claude-sonnet-5-5";
    let rawText: string;
    try {
      const result = await this.llm.complete({
        worldId: `forge_${randomUUID()}`,
        purpose: "pack",
        model,
        prompt: buildForgePrompt({ prompt, castSize, recommendedRounds, sources }),
        maxTokens: 4500,
        temperature: 0.7,
        // 12 个角色实测要两分钟；8 人约 60 秒，给足余量但别让请求挂死。
        timeoutMs: 120_000,
      });
      rawText = result.raw;
    } catch (error) {
      throw new BadGatewayException(
        `模型生成失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let raw: z.infer<typeof RawForgeSchema>;
    try {
      raw = RawForgeSchema.parse(extractJson(rawText));
    } catch (error) {
      throw new BadGatewayException(
        `种子包结果不合法：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let pack: PackConfig;
    try {
      pack = buildPackFromModel(raw, { castSize, recommendedRounds });
    } catch (error) {
      throw new BadGatewayException(
        `种子包校验失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.packs.register(pack);
    this.logger.info("种子包生成完成", {
      packId: pack.id,
      name: pack.name,
      agents: pack.initialCast.length,
      sources: sources.length,
      searchFailed,
    });
    return { pack, sources, searchFailed };
  }
}
