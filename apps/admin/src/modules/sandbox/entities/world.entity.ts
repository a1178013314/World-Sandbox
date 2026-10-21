import type { SeedConfig, WorldStatus } from "@ifss/shared";
import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("worlds")
export class WorldEntity {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Index()
  @Column({ name: "parent_id", type: "text", nullable: true })
  parentId!: string | null;

  @Column({ name: "fork_round", type: "integer", nullable: true })
  forkRound!: number | null;

  @Column({ type: "text" })
  title!: string;

  @Column({ name: "pack_id", type: "text" })
  packId!: string;

  @Column({ name: "seed_json", type: "simple-json" })
  seed!: SeedConfig;

  @Column({ name: "cast_source", type: "text" })
  castSource!: "preset" | "generated";

  @Column({ name: "rng_seed", type: "integer" })
  rngSeed!: number;

  @Column({ name: "current_round", type: "integer", default: 0 })
  currentRound!: number;

  @Column({ name: "total_rounds", type: "integer" })
  totalRounds!: number;

  @Column({ type: "text", default: "ready" })
  status!: WorldStatus;

  @Column({ name: "error_text", type: "text", nullable: true })
  errorText!: string | null;

  @Column({ name: "created_at", type: "text" })
  createdAt!: string;

  @Column({ name: "updated_at", type: "text" })
  updatedAt!: string;
}
