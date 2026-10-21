import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type PackConfig, PackConfigSchema, type PackSummary, summarizePack } from "@ifss/shared";
import { Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "../../../logger/app-logger.service";

/** 启动时读 packs/*.json 与 packs/generated/*.json；坏包只 warn 并跳过，不影响启动。 */
@Injectable()
export class PacksService implements OnModuleInit {
  private readonly packs = new Map<string, PackConfig>();
  private rootDir = "packs";

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  onModuleInit(): void {
    this.rootDir = this.config.get<string>("sandbox.packsDir") ?? "packs";
    this.loadDir(this.rootDir, false);
    this.loadDir(join(this.rootDir, "generated"), true);
    this.logger.info("种子包加载完成", { count: this.packs.size, dir: this.rootDir });
  }

  private loadDir(dir: string, optional: boolean): void {
    if (optional && !existsSync(dir)) {
      return;
    }
    let files: string[];
    try {
      files = readdirSync(dir).filter((file) => file.endsWith(".json"));
    } catch (error) {
      this.logger.warnWithFields("种子包目录不可读", {
        dir,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
        const pack = PackConfigSchema.parse(raw);
        this.packs.set(pack.id, pack);
      } catch (error) {
        this.logger.warnWithFields("跳过非法种子包", {
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** 运行时注册（一句话生成）；默认落盘到 packs/generated，重启后仍在。 */
  register(pack: PackConfig): void {
    this.packs.set(pack.id, pack);
    if (!(this.config.get<boolean>("sandbox.persistGeneratedPacks") ?? true)) {
      return;
    }
    try {
      const dir = join(this.rootDir, "generated");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${pack.id}.json`), `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    } catch (error) {
      this.logger.warnWithFields("种子包落盘失败，仅保存在内存", {
        packId: pack.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  list(): PackSummary[] {
    return [...this.packs.values()].map(summarizePack);
  }

  get(id: string): PackConfig {
    const pack = this.packs.get(id);
    if (!pack) {
      throw new NotFoundException(`种子包不存在：${id}`);
    }
    return pack;
  }

  find(id: string | undefined): PackConfig | undefined {
    return id ? this.packs.get(id) : undefined;
  }
}
