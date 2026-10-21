import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { registerAs } from "@nestjs/config";

function defaultPacksDir(): string {
  const cwd = process.cwd();
  const repoRoot =
    cwd.endsWith(`${join("apps", "admin")}`) || cwd.endsWith("apps/admin")
      ? resolve(cwd, "../..")
      : cwd;
  return join(repoRoot, "packs");
}

/**
 * 世界沙盘命名空间配置。全部给默认值，缺 key 时由 SandboxModule 在启动期报错。
 */
export const sandboxConfig = registerAs("sandbox", () => ({
  provider: (process.env.SANDBOX_LLM_PROVIDER ?? "openai") as "openai" | "fake",
  baseUrl: process.env.SANDBOX_LLM_BASE_URL ?? process.env.LLM_BASE_URL ?? "",
  apiKey: process.env.SANDBOX_LLM_API_KEY ?? process.env.LLM_API_KEY ?? "",
  modelAct: process.env.SANDBOX_MODEL_ACT ?? "claude-sonnet-5-5",
  modelCast: process.env.SANDBOX_MODEL_CAST ?? "claude-opus-4-7-thinking",
  maxCallsPerWorld: Number(process.env.SANDBOX_MAX_CALLS_PER_WORLD ?? 120),
  maxConcurrency: Number(process.env.SANDBOX_MAX_CONCURRENCY ?? 6),
  cacheEnabled: (process.env.SANDBOX_CACHE_ENABLED ?? "true") !== "false",
  packsDir: process.env.PACKS_DIR?.trim() || defaultPacksDir(),
}));

export interface SandboxConfig {
  provider: "openai" | "fake";
  baseUrl: string;
  apiKey: string;
  modelAct: string;
  modelCast: string;
  maxCallsPerWorld: number;
  maxConcurrency: number;
  cacheEnabled: boolean;
  packsDir: string;
}

export function resolvePacksDirOverride(dir: string): string {
  return existsSync(dir) ? dir : defaultPacksDir();
}
