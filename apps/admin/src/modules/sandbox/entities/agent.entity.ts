import type { AgentBelief, AgentMemory, AgentProfile, AgentState } from "@ifss/shared";
import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("agents")
@Index(["worldId", "agentId"], { unique: true })
export class AgentEntity {
  @PrimaryColumn({ name: "world_id", type: "text" })
  worldId!: string;

  @PrimaryColumn({ name: "agent_id", type: "text" })
  agentId!: string;

  @Column({ name: "profile_json", type: "simple-json" })
  profile!: AgentProfile;

  @Column({ name: "belief_json", type: "simple-json" })
  belief!: AgentBelief;

  @Column({ name: "memory_json", type: "simple-json" })
  memory!: AgentMemory;

  @Column({ name: "state_json", type: "simple-json" })
  state!: AgentState;
}
