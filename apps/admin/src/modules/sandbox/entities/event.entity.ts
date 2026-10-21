import type { EventKind } from "@ifss/shared";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export interface EventPayload {
  emotion?: { label: string; intensity: number };
  private_reason?: string;
  thread_id?: number;
  mentions?: string[];
  quota_violation?: boolean;
  cancelled?: number;
  [key: string]: unknown;
}

/** 事件只追加：seq 全局自增，做 SSE 的 Last-Event-ID。 */
@Entity("events")
@Index(["worldId", "round"])
export class EventEntity {
  @PrimaryGeneratedColumn({ name: "seq", type: "integer" })
  seq!: number;

  @Index()
  @Column({ name: "world_id", type: "text" })
  worldId!: string;

  @Column({ type: "integer" })
  round!: number;

  @Column({ type: "text" })
  kind!: EventKind;

  @Column({ name: "actor_id", type: "text", nullable: true })
  actorId!: string | null;

  @Column({ name: "target_id", type: "text", nullable: true })
  targetId!: string | null;

  @Column({ type: "text", nullable: true })
  content!: string | null;

  @Column({ name: "payload_json", type: "simple-json", nullable: true })
  payload!: EventPayload | null;

  @Column({ type: "text", default: "public" })
  visibility!: string;

  @Column({ name: "created_at", type: "text" })
  createdAt!: string;
}
