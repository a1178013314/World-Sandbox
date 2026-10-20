import { config as loadDotenv } from "dotenv";
import { bootstrapApp } from "./bootstrap";
import { AppLoggerService } from "./logger/app-logger.service";

loadDotenv();

const DEFAULT_PORT = 3001;

function parsePort(raw: string | undefined): number {
  if (!raw || raw.trim() === "") {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    // 启动最早期失败，logger 尚未就绪，允许直接写 stderr
    console.error(`[admin] PORT 非法：${raw}，必须是 1-65535 的整数`);
    process.exit(1);
  }
  return port;
}

async function main(): Promise<void> {
  const port = parsePort(process.env.PORT);
  const app = await bootstrapApp();

  await app.listen(port);
  app.get(AppLoggerService).info("admin 已启动", {
    port,
    health: `http://localhost:${port}/api/health`,
    docs: `http://localhost:${port}/api/docs`,
  });
}

main().catch((error: unknown) => {
  console.error("[admin] 启动失败", error);
  process.exit(1);
});
