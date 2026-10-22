import Joi from "joi";

/**
 * env fail-fast 校验：缺失/非法直接让进程起不来。
 * 可选变量在此给默认值，业务侧统一经 ConfigService 读取。
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  HOST: Joi.string().trim().optional(),
  DB_PATH: Joi.string().trim().min(1).optional(),
  LOG_LEVEL: Joi.string().valid("trace", "debug", "info", "warn", "error", "fatal").default("info"),
  SANDBOX_LLM_PROVIDER: Joi.string().valid("openai", "fake").default("openai"),
  SANDBOX_LLM_BASE_URL: Joi.string().allow("").optional(),
  SANDBOX_LLM_API_KEY: Joi.string().allow("").optional(),
  SANDBOX_MODEL_ACT: Joi.string().default("claude-sonnet-5-5"),
  SANDBOX_MODEL_CAST: Joi.string().default("claude-opus-4-7-thinking"),
  SANDBOX_MODEL_FORGE: Joi.string().default("claude-sonnet-5-5"),
  SANDBOX_MAX_CALLS_PER_WORLD: Joi.number().integer().min(1).default(120),
  SANDBOX_MAX_CONCURRENCY: Joi.number().integer().min(1).max(32).default(6),
  SANDBOX_CACHE_ENABLED: Joi.boolean().default(true),
  PACKS_DIR: Joi.string().allow("").optional(),
  SANDBOX_SEARCH_ENABLED: Joi.boolean().default(true),
  SANDBOX_SEARCH_ENDPOINT: Joi.string().allow("").optional(),
  SANDBOX_SEARCH_TIMEOUT_MS: Joi.number().integer().min(1000).max(30000).default(9000),
  SANDBOX_PERSIST_GENERATED_PACKS: Joi.boolean().default(true),
  SANDBOX_TTS_ENABLED: Joi.boolean().default(true),
  SANDBOX_TTS_MODEL: Joi.string().default("qwen3-tts-flash"),
  SANDBOX_TTS_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(20000),
  SANDBOX_TTS_VOICES: Joi.string().allow("").optional(),
});
