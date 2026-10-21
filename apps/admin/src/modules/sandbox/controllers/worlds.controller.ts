import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Response } from "express";
import { Repository } from "typeorm";
import {
  CallsQueryDto,
  CreateWorldDto,
  EventsQueryDto,
  ForkDto,
  InterventionDto,
  InterviewDto,
  PreviewCastDto,
  RunWorldDto,
} from "../dto/sandbox.dto";
import { CallEntity } from "../entities/call.entity";
import { CardsService } from "../services/cards";
import { CastService } from "../services/cast";
import { InterviewService } from "../services/interview";
import { LoopService } from "../services/loop";
import { TtsService } from "../services/tts";
import { WorldService } from "../services/world";

@Controller("worlds")
export class WorldsController {
  constructor(
    private readonly worlds: WorldService,
    private readonly loop: LoopService,
    private readonly cast: CastService,
    private readonly interview: InterviewService,
    private readonly cards: CardsService,
    private readonly tts: TtsService,
    @InjectRepository(CallEntity)
    private readonly calls: Repository<CallEntity>,
  ) {}

  @Post("cast/preview")
  preview(@Body() dto: PreviewCastDto) {
    return this.cast.preview({
      worldId: `preview_${randomUUID()}`,
      seedText: dto.seedText,
      castSize: dto.castSize,
    });
  }

  @Post()
  create(@Body() dto: CreateWorldDto) {
    return this.worlds.create({
      packId: dto.packId,
      seedText: dto.seedText,
      totalRounds: dto.totalRounds,
      cast: dto.cast === "preset" ? "preset" : (dto.cast as never),
    });
  }

  @Post("import")
  importWorld(@Body() payload: never) {
    return this.worlds.importWorld(payload);
  }

  @Get()
  list() {
    return this.worlds.list();
  }

  @Get(":id")
  snapshot(@Param("id") id: string) {
    return this.worlds.snapshot(id);
  }

  @Get(":id/events")
  events(@Param("id") id: string, @Query() query: EventsQueryDto) {
    return this.worlds.eventList(id, query.round);
  }

  @Get(":id/tts/:seq")
  async narrate(
    @Param("id") id: string,
    @Param("seq") seq: string,
    @Res() res: Response,
  ): Promise<void> {
    const value = Number(seq);
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException("seq 必须是正整数");
    }
    const audio = await this.tts.audioForEvent(id, value);
    res.set({
      "Content-Type": audio.contentType,
      "Content-Length": String(audio.buffer.length),
      "Cache-Control": "public, max-age=86400",
      "X-TTS-Voice": audio.voice,
    });
    res.end(audio.buffer);
  }

  @Post(":id/run")
  run(@Param("id") id: string, @Body() dto: RunWorldDto) {
    return this.loop.start(id, dto.rounds);
  }

  @Post(":id/stop")
  stop(@Param("id") id: string) {
    return this.loop.stop(id);
  }

  @Post(":id/events")
  intervene(@Param("id") id: string, @Body() dto: InterventionDto) {
    return this.worlds.createIntervention(id, dto);
  }

  @Delete(":id/events/:seq")
  cancelIntervention(@Param("id") id: string, @Param("seq") seq: string) {
    return this.worlds.cancelIntervention(id, Number(seq));
  }

  @Post(":id/fork")
  fork(@Param("id") id: string, @Body() dto: ForkDto) {
    return this.worlds.fork(id, dto);
  }

  @Post(":id/interview")
  ask(@Param("id") id: string, @Body() dto: InterviewDto) {
    return this.interview.ask(id, dto.agentId, dto.question);
  }

  @Get(":id/cards")
  emergence(@Param("id") id: string) {
    return this.cards.get(id);
  }

  @Get(":id/compare/:other")
  async compare(@Param("id") id: string, @Param("other") other: string) {
    const [left, right, leftCards, rightCards] = await Promise.all([
      this.worlds.snapshot(id),
      this.worlds.snapshot(other),
      this.cards.get(id),
      this.cards.get(other),
    ]);
    return {
      worlds: [left.world, right.world],
      metrics: [left.metrics, right.metrics],
      cards: leftCards.cards.map((card, index) => ({
        a: card,
        b: rightCards.cards[index] ?? null,
      })),
    };
  }

  @Get(":id/calls")
  async callLog(@Param("id") id: string, @Query() query: CallsQueryDto) {
    await this.worlds.get(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.calls.findAndCount({
      where: query.purpose ? { worldId: id, purpose: query.purpose } : { worldId: id },
      order: { createdAt: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  @Get(":id/export")
  exportWorld(@Param("id") id: string) {
    return this.worlds.exportWorld(id);
  }
}
