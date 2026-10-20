import { join } from "node:path";
import { registerAs } from "@nestjs/config";

export const DEFAULT_DB_PATH = "data/ifss.sqlite";

/**
 * 数据库命名空间配置：业务侧用 config.get("db.database") 读取。
 * SQLite 文件默认落在进程工作目录下，换 PostgreSQL 时只改这里与驱动。
 */
export const databaseConfig = registerAs("db", () => ({
  database: process.env.DB_PATH?.trim() || join(process.cwd(), DEFAULT_DB_PATH),
}));
