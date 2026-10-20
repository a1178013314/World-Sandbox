import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/** 骨架期的极简 KV 表：验证 SQLite 可写可读，业务模块可照此扩展 */
@Entity("app_kv")
export class AppKvEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  key!: string;

  @Column({ type: "text" })
  value!: string;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
