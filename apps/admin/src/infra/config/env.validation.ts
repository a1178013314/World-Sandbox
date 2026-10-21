import Joi from "joi";

/**
 * env fail-fast 校验：缺失/非法直接让进程起不来。
 * 可选变量在此给默认值，业务侧统一经 ConfigService 读取。
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  DB_PATH: Joi.string().trim().min(1).optional(),
  LOG_LEVEL: Joi.string().valid("trace", "debug", "info", "warn", "error", "fatal").default("info"),
  SANDBOX_LLM_PROVIDER: Joi.string().valid("openai", "fake").default("openai"),
  SANDBOX_LLM_BASE_URL: Joi.string().allow("").optional(),
  SANDBOX_LLM_API_KEY: Joi.string().allow("").optional(),
  SANDBOX_MODEL_ACT: Joi.string().default("claude-sonnet-5-5"),
  SANDBOX_MODEL_CAST: Joi.string().default("claude-opus-4-7-thinking"),
  SANDBOX_MAX_CALLS_PER_WORLD: Joi.number().integer().min(1).default(120),
  SANDBOX_MAX_CONCURRENCY: Joi.number().integer().min(1).max(32).default(6),
  SANDBOX_CACHE_ENABLED: Joi.boolean().default(true),
  PACKS_DIR: Joi.string().allow("").optional(),
});
