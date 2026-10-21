import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ForgePackDto } from "../dto/sandbox.dto";
import { PackForgeService } from "../services/pack-forge";
import { PacksService } from "../services/packs";

@Controller("packs")
export class PacksController {
  constructor(
    private readonly packs: PacksService,
    private readonly forgePack: PackForgeService,
  ) {}

  @Get()
  list() {
    return this.packs.list();
  }

  /** 一句话 → 检索 → 生成种子包并注册（已存在则直接建世界）。 */
  @Post("forge")
  forge(@Body() dto: ForgePackDto) {
    return this.forgePack.forge(dto);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.packs.get(id);
  }
}
