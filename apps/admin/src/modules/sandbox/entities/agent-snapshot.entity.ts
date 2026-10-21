import type { AgentBelief, AgentMemory, AgentState } from "@ifss/shared";
import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("agent_snapshots")
export class AgentSnapshotEntity {
  @PrimaryColumn({ name: "world_id", type: "text" })
  worldId!: string;

  @PrimaryColumn({ type: "integer" })
  round!: number;

  @PrimaryColumn({ name: "agent_id", type: "text" })
  agentId!: string;

  @Column({ name: "belief_json", type: "simple-json" })
  belief!: AgentBelief;

  @Column({ name: "memory_json", type: "simple-json" })
  memory!: AgentMemory;

  @Column({ name: "state_json", type: "simple-json" })
  state!: AgentState;
}
