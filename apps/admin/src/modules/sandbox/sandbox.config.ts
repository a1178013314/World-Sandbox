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
  modelForge: process.env.SANDBOX_MODEL_FORGE ?? "claude-sonnet-5-5",
  maxCallsPerWorld: Number(process.env.SANDBOX_MAX_CALLS_PER_WORLD ?? 120),
  maxConcurrency: Number(process.env.SANDBOX_MAX_CONCURRENCY ?? 6),
  cacheEnabled: (process.env.SANDBOX_CACHE_ENABLED ?? "true") !== "false",
  packsDir: process.env.PACKS_DIR?.trim() || defaultPacksDir(),
  searchEnabled: (process.env.SANDBOX_SEARCH_ENABLED ?? "true") !== "false",
  searchEndpoint:
    process.env.SANDBOX_SEARCH_ENDPOINT?.trim() || "https://api.anysearch.com/v1/search",
  searchTimeoutMs: Number(process.env.SANDBOX_SEARCH_TIMEOUT_MS ?? 9000),
  persistGeneratedPacks: (process.env.SANDBOX_PERSIST_GENERATED_PACKS ?? "true") !== "false",
  ttsEnabled: (process.env.SANDBOX_TTS_ENABLED ?? "true") !== "false",
  ttsModel: process.env.SANDBOX_TTS_MODEL?.trim() || "qwen3-tts-flash",
  ttsTimeoutMs: Number(process.env.SANDBOX_TTS_TIMEOUT_MS ?? 20000),
  ttsVoices: process.env.SANDBOX_TTS_VOICES?.trim() || "Cherry,Serena,Ethan,Chelsie,Dylan,Ryan",
}));

export interface SandboxConfig {
  provider: "openai" | "fake";
  baseUrl: string;
  apiKey: string;
  modelAct: string;
  modelCast: string;
  modelForge: string;
  maxCallsPerWorld: number;
  maxConcurrency: number;
  cacheEnabled: boolean;
  packsDir: string;
  searchEnabled: boolean;
  searchEndpoint: string;
  searchTimeoutMs: number;
  persistGeneratedPacks: boolean;
  ttsEnabled: boolean;
  ttsModel: string;
  ttsTimeoutMs: number;
  ttsVoices: string;
}

export function resolvePacksDirOverride(dir: string): string {
  return existsSync(dir) ? dir : defaultPacksDir();
}
