import { envValidationSchema } from "./env.validation";

/** ConfigModule 的 validate 钩子：Joi 校验 env，fail-fast，未知变量（PATH 等）直接放行 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    throw new Error(`环境变量校验失败：${error.message}`);
  }

  return (value ?? config) as Record<string, unknown>;
}
