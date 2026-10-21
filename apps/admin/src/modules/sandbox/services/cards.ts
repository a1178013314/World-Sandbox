import type { EmergenceCard } from "@ifss/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { LlmService } from "../llm/llm.service";
import { buildCardsPrompt } from "../prompts/cards";
import { extractJson } from "./json";
import { WorldService } from "./world";

const CardsOutputSchema = z.object({
  cards: z
    .array(
      z.object({
        type: z.enum(["出圈", "分歧", "沉默", "转折"]),
        quote: z.string().trim().min(1),
        ref: z.number(),
        why: z.string().trim().min(1),
      }),
    )
    .default([]),
});

@Injectable()
export class CardsService {
  private readonly cache = new Map<string, EmergenceCard[]>();

  constructor(
    private readonly worlds: WorldService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async get(worldId: string): Promise<{ cards: EmergenceCard[] }> {
    const cached = this.cache.get(worldId);
    if (cached) {
      return { cards: cached };
    }
    const snapshot = await this.worlds.snapshot(worldId);
    const events = (await this.worlds.eventList(worldId))
      .filter((event) => event.kind !== "like" && event.content)
      .map((event) => ({
        seq: event.seq,
        round: event.round,
        actorId: event.actorId,
        kind: event.kind,
        content: event.content ?? "",
      }));
    if (events.length === 0) {
      return { cards: [] };
    }

    const model = this.config.get<string>("sandbox.modelCast") ?? "claude-opus-4-7-thinking";
    const result = await this.llm.complete({
      worldId,
      round: snapshot.world.currentRound,
      purpose: "card",
      model,
      prompt: buildCardsPrompt({
        scene: snapshot.world.seed.scene,
        events,
        metrics: snapshot.metrics.at(-1) ?? null,
      }),
      maxTokens: 800,
      temperature: 0.6,
    });

    let cards: EmergenceCard[] = [];
    try {
      const parsed = CardsOutputSchema.parse(extractJson(result.raw));
      const seqs = new Set(events.map((event) => event.seq));
      cards = parsed.cards
        .filter((card) => seqs.has(card.ref))
        .slice(0, 3)
        .map((card) => ({
          type: card.type,
          quote: card.quote.slice(0, 80),
          ref: card.ref,
          why: card.why.slice(0, 120),
        }));
    } catch (error) {
      this.logger.warnWithFields("涌现卡解析失败", {
        worldId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (cards.length > 0) {
      this.cache.set(worldId, cards);
    }
    return { cards };
  }

  invalidate(worldId: string): void {
    this.cache.delete(worldId);
  }
}
