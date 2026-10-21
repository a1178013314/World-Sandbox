import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PacksController } from "./controllers/packs.controller";
import { StreamController } from "./controllers/stream.controller";
import { WorldsController } from "./controllers/worlds.controller";
import { AgentEntity } from "./entities/agent.entity";
import { AgentSnapshotEntity } from "./entities/agent-snapshot.entity";
import { CallEntity } from "./entities/call.entity";
import { DeliveryEntity } from "./entities/delivery.entity";
import { EventEntity } from "./entities/event.entity";
import { LlmCacheEntity } from "./entities/llm-cache.entity";
import { RoundEntity } from "./entities/round.entity";
import { WorldEntity } from "./entities/world.entity";
import { BudgetGuard } from "./llm/budget";
import { LlmCacheStore } from "./llm/cache";
import { FakeProvider } from "./llm/fake-provider";
import { LlmService } from "./llm/llm.service";
import { OpenAiProvider } from "./llm/openai-provider";
import { LLM_PROVIDER } from "./llm/provider";
import { SandboxRuntime } from "./runtime";
import { ActorService } from "./services/actor";
import { CardsService } from "./services/cards";
import { CastService } from "./services/cast";
import { InterviewService } from "./services/interview";
import { LoopService } from "./services/loop";
import { PacksService } from "./services/packs";
import { WorldService } from "./services/world";

const ENTITIES = [
  WorldEntity,
  AgentEntity,
  EventEntity,
  DeliveryEntity,
  RoundEntity,
  CallEntity,
  AgentSnapshotEntity,
  LlmCacheEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  controllers: [PacksController, WorldsController, StreamController],
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>("sandbox.provider") ?? "openai";
        if (provider === "fake") {
          return new FakeProvider();
        }
        const baseUrl = config.get<string>("sandbox.baseUrl") ?? "";
        const apiKey = config.get<string>("sandbox.apiKey") ?? "";
        if (!baseUrl || !apiKey) {
          throw new Error("SANDBOX_LLM_PROVIDER=openai 时必须配置 LLM_BASE_URL 与 LLM_API_KEY");
        }
        return new OpenAiProvider(baseUrl, apiKey);
      },
    },
    LlmCacheStore,
    BudgetGuard,
    LlmService,
    SandboxRuntime,
    PacksService,
    CastService,
    ActorService,
    InterviewService,
    CardsService,
    WorldService,
    LoopService,
  ],
})
export class SandboxModule {}
