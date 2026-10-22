import { z } from "zod";
import { AgentProfileSchema, WORLD_MAX_ROUNDS, WORLD_MIN_ROUNDS } from "./world";

export const PackConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  renderMode: z.literal("chat"),
  seed: z.object({
    text: z.string().trim().min(1),
    background: z.string().trim().min(1).max(160).optional(),
    scene: z.string().trim().min(1),
    timeSlots: z.array(z.string().trim().min(1)).min(1),
    gateCoefficient: z.number().min(0).max(2),
  }),
  recommendedRounds: z.number().int().min(WORLD_MIN_ROUNDS).max(WORLD_MAX_ROUNDS),
  initialCast: z.array(AgentProfileSchema).min(1),
});

export type PackConfig = z.infer<typeof PackConfigSchema>;

export interface PackSummary {
  id: string;
  name: string;
  castSize: number;
  recommendedRounds: number;
}

/** 检索命中的一条外部资料，用于展示生成依据。 */
export interface PackSource {
  title: string;
  url: string;
  snippet: string;
}

/** 一句话生成种子包的结果；pack 已注册，可直接用于 POST /worlds。 */
export interface ForgePackResult {
  pack: PackConfig;
  sources: PackSource[];
  searchFailed: boolean;
}

export function summarizePack(pack: PackConfig): PackSummary {
  return {
    id: pack.id,
    name: pack.name,
    castSize: pack.initialCast.length,
    recommendedRounds: pack.recommendedRounds,
  };
}
