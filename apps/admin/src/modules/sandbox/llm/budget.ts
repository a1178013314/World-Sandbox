import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CallEntity } from "../entities/call.entity";

export class BudgetExceeded extends Error {
  constructor(
    readonly worldId: string,
    readonly limit: number,
  ) {
    super(`world ${worldId} 已达调用预算上限 ${limit}`);
    this.name = "BudgetExceeded";
  }
}

@Injectable()
export class BudgetGuard {
  constructor(
    @InjectRepository(CallEntity)
    private readonly calls: Repository<CallEntity>,
    private readonly config: ConfigService,
  ) {}

  async check(worldId: string): Promise<void> {
    const limit = this.config.get<number>("sandbox.maxCallsPerWorld") ?? 120;
    const used = await this.calls.count({ where: { worldId } });
    if (used >= limit) {
      throw new BudgetExceeded(worldId, limit);
    }
  }
}
