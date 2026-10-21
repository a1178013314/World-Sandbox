import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("calls")
@Index(["worldId", "purpose"])
export class CallEntity {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Index()
  @Column({ name: "world_id", type: "text" })
  worldId!: string;

  @Column({ type: "integer", nullable: true })
  round!: number | null;

  @Column({ name: "agent_id", type: "text", nullable: true })
  agentId!: string | null;

  @Column({ type: "text" })
  purpose!: string;

  @Column({ name: "prompt_hash", type: "text" })
  promptHash!: string;

  @Column({ type: "text" })
  model!: string;

  @Column({ name: "tokens_in", type: "integer", nullable: true })
  tokensIn!: number | null;

  @Column({ name: "tokens_out", type: "integer", nullable: true })
  tokensOut!: number | null;

  @Column({ name: "latency_ms", type: "integer", nullable: true })
  latencyMs!: number | null;

  @Column({ name: "raw_response", type: "text", nullable: true })
  rawResponse!: string | null;

  @Column({ type: "integer" })
  ok!: number;

  @Column({ type: "text", nullable: true })
  error!: string | null;

  @Column({ name: "created_at", type: "text" })
  createdAt!: string;
}
