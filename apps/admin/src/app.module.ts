import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { TraceMiddleware } from "./common/middleware/trace.middleware";
import { databaseConfig } from "./infra/config/database.config";
import { validateEnv } from "./infra/config/validate-env";
import { DatabaseModule } from "./infra/database/database.module";
import { LoggerModule } from "./logger/logger.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [databaseConfig],
    }),
    LoggerModule,
    DatabaseModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Express 5 起 "*" 通配符废弃，改用具名通配（path-to-regexp v8）匹配全部路径
    consumer.apply(TraceMiddleware).forRoutes({ path: "{*splat}", method: RequestMethod.ALL });
  }
}
