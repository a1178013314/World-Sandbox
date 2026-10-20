import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "./common/decorators/public.decorator";

export interface HealthResponse {
  status: "ok";
  timestamp: string;
  uptime: number;
}

@ApiTags("system")
@Controller()
export class AppController {
  /** 纯骨架探针：不接任何存储，只验证进程存活 */
  @Get("health")
  @Public()
  @ApiOperation({ summary: "基础健康探针" })
  @ApiOkResponse({ description: "应用进程存活" })
  health(): HealthResponse {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Number(process.uptime().toFixed(3)),
    };
  }
}
