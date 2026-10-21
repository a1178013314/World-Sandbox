import { z } from "zod";
import { AgentProfileSchema } from "./world";

export const PackConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  renderMode: z.literal("chat"),
  seed: z.object({
    text: z.string().trim().min(1),
    scene: z.string().trim().min(1),
    timeSlots: z.array(z.string().trim().min(1)).min(1),
    gateCoefficient: z.number().min(0).max(2),
  }),
  recommendedRounds: z.number().int().min(1).max(50),
  initialCast: z.array(AgentProfileSchema).min(1),
});

export type PackConfig = z.infer<typeof PackConfigSchema>;

export interface PackSummary {
  id: string;
  name: string;
  castSize: number;
  recommendedRounds: number;
}

export function summarizePack(pack: PackConfig): PackSummary {
  return {
    id: pack.id,
    name: pack.name,
    castSize: pack.initialCast.length,
    recommendedRounds: pack.recommendedRounds,
  };
}
