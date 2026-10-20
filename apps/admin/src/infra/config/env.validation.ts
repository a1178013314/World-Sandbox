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
});
