import { z } from "zod";

export const POST_MAX_CHARS = 80;
export const REPLY_MAX_CHARS = 40;

export const ActionKindSchema = z.enum(["post", "reply", "like", "ignore"]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

export const EmotionSchema = z
  .object({
    label: z.string().trim().min(1).max(12),
    intensity: z.number().min(0).max(1),
  })
  .default({ label: "平静", intensity: 0.3 });

/**
 * 模型输出的唯一动作契约。文本超限按动作类型截断，其余结构错误抛错，
 * 由 actor 决定修复或降级。
 */
export const AgentActionSchema = z
  .object({
    action: ActionKindSchema,
    target_id: z.string().trim().min(1).nullish(),
    text: z.string().trim().min(1).nullish(),
    emotion: EmotionSchema,
    private_reason: z.string().trim().max(200).default(""),
  })
  .superRefine((value, ctx) => {
    const hasText = value.text !== null && value.text !== undefined;
    if (value.action === "ignore" && hasText) {
      ctx.addIssue({ code: "custom", message: "ignore 不允许携带 text", path: ["text"] });
    }
    if ((value.action === "post" || value.action === "reply") && !hasText) {
      ctx.addIssue({ code: "custom", message: `${value.action} 必须携带 text`, path: ["text"] });
    }
    if ((value.action === "reply" || value.action === "like") && !value.target_id) {
      ctx.addIssue({
        code: "custom",
        message: `${value.action} 必须携带 target_id`,
        path: ["target_id"],
      });
    }
  })
  .transform((value) => {
    const limit = value.action === "reply" ? REPLY_MAX_CHARS : POST_MAX_CHARS;
    return {
      action: value.action,
      target_id: value.target_id ?? null,
      text: value.text == null ? null : value.text.slice(0, limit),
      emotion: value.emotion,
      private_reason: value.private_reason,
    };
  });

export type AgentAction = z.infer<typeof AgentActionSchema>;
