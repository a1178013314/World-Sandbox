import type { SandboxMetrics } from "@ifss/shared";
import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("rounds")
export class RoundEntity {
  @PrimaryColumn({ name: "world_id", type: "text" })
  worldId!: string;

  @PrimaryColumn({ type: "integer" })
  round!: number;

  @Column({ name: "time_label", type: "text", nullable: true })
  timeLabel!: string | null;

  @Column({ name: "active_ids", type: "simple-json" })
  activeIds!: string[];

  @Column({ name: "spoke_ids", type: "simple-json" })
  spokeIds!: string[];

  @Column({ name: "silent_ids", type: "simple-json" })
  silentIds!: string[];

  @Column({ name: "gated_ids", type: "simple-json" })
  gatedIds!: string[];

  @Column({ name: "metrics_json", type: "simple-json", nullable: true })
  metrics!: SandboxMetrics | null;
}
