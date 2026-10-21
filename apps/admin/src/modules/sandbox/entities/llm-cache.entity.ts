import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("llm_cache")
export class LlmCacheEntity {
  @PrimaryColumn({ name: "prompt_hash", type: "text" })
  promptHash!: string;

  @Column({ type: "text" })
  model!: string;

  @Column({ name: "raw_response", type: "text" })
  rawResponse!: string;

  @Column({ name: "created_at", type: "text" })
  createdAt!: string;
}
