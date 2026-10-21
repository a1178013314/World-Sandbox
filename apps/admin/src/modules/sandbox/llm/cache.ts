import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LlmCacheEntity } from "../entities/llm-cache.entity";

@Injectable()
export class LlmCacheStore {
  constructor(
    @InjectRepository(LlmCacheEntity)
    private readonly cache: Repository<LlmCacheEntity>,
  ) {}

  async get(promptHash: string): Promise<LlmCacheEntity | null> {
    return this.cache.findOne({ where: { promptHash } });
  }

  async set(promptHash: string, model: string, rawResponse: string): Promise<void> {
    await this.cache.save({
      promptHash,
      model,
      rawResponse,
      createdAt: new Date().toISOString(),
    });
  }
}
