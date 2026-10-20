import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule, type TypeOrmModuleOptions } from "@nestjs/typeorm";
import { AppLoggerService } from "../../logger/app-logger.service";
import { AppKvEntity } from "./entities/app-kv.entity";

function ensureSqliteDirectory(database: string): void {
  if (database === ":memory:") {
    return;
  }
  mkdirSync(dirname(database), { recursive: true });
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService, AppLoggerService],
      useFactory: (config: ConfigService, logger: AppLoggerService): TypeOrmModuleOptions => {
        const database = config.get<string>("db.database") ?? ":memory:";
        ensureSqliteDirectory(database);
        logger.info("SQLite 数据源装配完成", { database, synchronize: true });

        return {
          type: "better-sqlite3",
          database,
          synchronize: true,
          autoLoadEntities: true,
        };
      },
    }),
    TypeOrmModule.forFeature([AppKvEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
