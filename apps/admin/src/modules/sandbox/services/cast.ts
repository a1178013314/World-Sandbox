import { type AgentProfile, AgentProfileSchema } from "@ifss/shared";
import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { LlmService } from "../llm/llm.service";
import { buildCastPrompt } from "../prompts/cast";
import { extractJson } from "./json";

const RawProfileSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  role: z.string().optional(),
  goals: z.array(z.string()).optional(),
  fears: z.array(z.string()).optional(),
  voice: z.string().optional(),
  stance: z
    .object({
      issue: z.string().optional(),
      position: z.enum(["support", "oppose", "neutral", "procedural"]).optional(),
      intensity: z.number().optional(),
    })
    .optional(),
  influence: z.number().optional(),
  activity: z
    .object({
      level: z.number().optional(),
      hours: z.array(z.number()).optional(),
    })
    .optional(),
  can_see: z.array(z.string()).optional(),
});

const RawCastSchema = z.union([
  z.array(RawProfileSchema),
  z.object({ cast: z.array(RawProfileSchema) }),
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface PreviewCastInput {
  worldId: string;
  seedText: string;
  castSize: number;
}

@Injectable()
export class CastService {
  constructor(
    private readonly llm: LlmService,
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  /** 造人草稿：一次 opus 调用，不落库；id 由后端重编，不采信模型。 */
  async preview(input: PreviewCastInput): Promise<AgentProfile[]> {
    const size = clamp(Math.trunc(input.castSize), 3, 12);
    const model = this.config.get<string>("sandbox.modelCast") ?? "claude-opus-4-7-thinking";
    const prompt = buildCastPrompt({ seedText: input.seedText, castSize: size });
    const result = await this.llm.complete({
      worldId: input.worldId,
      purpose: "cast",
      model,
      prompt,
      maxTokens: 2400,
      temperature: 0.8,
    });

    let raw: z.infer<typeof RawCastSchema>;
    try {
      raw = RawCastSchema.parse(extractJson(result.raw));
    } catch (error) {
      throw new BadGatewayException(
        `造人结果不合法：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const list = Array.isArray(raw) ? raw : raw.cast;
    if (list.length === 0) {
      throw new BadGatewayException("造人结果为空");
    }

    const issue =
      input.seedText
        .trim()
        .split(/[。！？\n]/)[0]
        ?.slice(0, 30) || "当前议题";
    return list.slice(0, size).map((item, index) => {
      const missing: string[] = [];
      if (!item.role) missing.push("role");
      if (!item.stance?.issue) missing.push("stance.issue");
      if (!item.stance?.position) missing.push("stance.position");
      if (item.influence === undefined) missing.push("influence");
      if (!item.activity?.hours?.length) missing.push("activity.hours");
      if (missing.length > 0) {
        this.logger.warnWithFields("造人结果字段缺失，已补默认值", {
          index,
          missing,
        });
      }

      const hours = (item.activity?.hours ?? []).filter(
        (hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23,
      );
      const candidate = {
        id: `agent_${index + 1}`,
        name: item.name,
        role: item.role?.trim() || "群成员",
        goals: item.goals ?? [],
        fears: item.fears ?? [],
        voice: item.voice ?? "",
        stance: {
          issue: item.stance?.issue?.trim() || issue,
          position: item.stance?.position ?? "neutral",
          intensity: clamp(item.stance?.intensity ?? 0.5, 0, 1),
        },
        influence: clamp(item.influence ?? 0.4, 0, 1),
        activity: {
          level: clamp(item.activity?.level ?? 0.5, 0, 1),
          hours: hours.length > 0 ? hours.slice(0, 8) : [9, 21],
        },
        can_see: item.can_see ?? ["本群消息"],
      };
      return AgentProfileSchema.parse(candidate);
    });
  }
}
