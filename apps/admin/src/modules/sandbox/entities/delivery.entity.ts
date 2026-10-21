import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("deliveries")
@Index(["worldId", "agentId"])
export class DeliveryEntity {
  @PrimaryColumn({ name: "world_id", type: "text" })
  worldId!: string;

  @PrimaryColumn({ name: "event_seq", type: "integer" })
  eventSeq!: number;

  @PrimaryColumn({ name: "agent_id", type: "text" })
  agentId!: string;

  @Column({ name: "seen_round", type: "integer" })
  seenRound!: number;

  @Column({ type: "real", default: 0.5 })
  salience!: number;
}
