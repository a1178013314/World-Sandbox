import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { CallEntity } from "../entities/call.entity";
import { BudgetGuard } from "./budget";
import { LlmCacheStore } from "./cache";
import { LLM_PROVIDER, type LlmProvider, type LlmPurpose, type LlmResult } from "./provider";

export interface LlmCallContext {
  worldId: string;
  round?: number | null;
  agentId?: string | null;
}

export interface LlmCompletionInput extends LlmCallContext {
  purpose: LlmPurpose;
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
}

export function promptHashOf(model: string, prompt: string): string {
  return createHash("sha256").update(`${model}\n${prompt}`).digest("hex");
}

/**
 * LLM 唯一出口：预算闸门 → 缓存 → provider → calls 审计。
 * 缓存命中同样写一条 ok=1 的调用日志，便于 debug 页看见「省钱」。
 */
@Injectable()
export class LlmService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    private readonly cache: LlmCacheStore,
    private readonly budget: BudgetGuard,
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
    @InjectRepository(CallEntity)
    private readonly calls: Repository<CallEntity>,
  ) {}

  async complete(input: LlmCompletionInput): Promise<LlmResult> {
    await this.budget.check(input.worldId);
    const promptHash = promptHashOf(input.model, input.prompt);
    const createdAt = new Date().toISOString();
    const cacheEnabled = this.config.get<boolean>("sandbox.cacheEnabled") ?? true;

    if (cacheEnabled) {
      const hit = await this.cache.get(promptHash);
      if (hit) {
        await this.logCall(input, promptHash, 0, 0, 0, hit.rawResponse, null, createdAt);
        return { raw: hit.rawResponse, tokensIn: 0, tokensOut: 0, latencyMs: 0 };
      }
    }

    try {
      const result = await this.provider.complete({
        purpose: input.purpose,
        model: input.model,
        prompt: input.prompt,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
      });
      if (cacheEnabled) {
        await this.cache.set(promptHash, input.model, result.raw);
      }
      await this.logCall(
        input,
        promptHash,
        result.tokensIn,
        result.tokensOut,
        result.latencyMs,
        result.raw,
        null,
        createdAt,
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logCall(input, promptHash, 0, 0, 0, null, message, createdAt);
      throw error;
    }
  }

  private async logCall(
    input: LlmCompletionInput,
    promptHash: string,
    tokensIn: number,
    tokensOut: number,
    latencyMs: number,
    rawResponse: string | null,
    error: string | null,
    createdAt: string,
  ): Promise<void> {
    await this.calls.save({
      id: randomUUID(),
      worldId: input.worldId,
      round: input.round ?? null,
      agentId: input.agentId ?? null,
      purpose: input.purpose,
      promptHash,
      model: input.model,
      tokensIn,
      tokensOut,
      latencyMs,
      rawResponse: rawResponse ? rawResponse.slice(0, 4000) : null,
      ok: error === null ? 1 : 0,
      error: error ? error.slice(0, 500) : null,
      createdAt,
    });

    this.logger.info("LLM 调用", {
      purpose: input.purpose,
      model: input.model,
      worldId: input.worldId,
      round: input.round ?? null,
      agentId: input.agentId ?? null,
      latencyMs,
      tokensIn,
      tokensOut,
      ok: error === null,
      promptHash: promptHash.slice(0, 16),
    });
  }
}
