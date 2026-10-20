# 初始框架搭建技术 Spec（基础设施，不含业务逻辑）

- 日期：2026-08-23（2026-09-19 修订：依赖整体升级 + 测试栈统一 Vitest，见 §2 选型表）
- 状态：现状沉淀 + 初期选型决策（描述已落地的骨架与初期开发的数据库选型）
- 范围：仅覆盖框架搭建部分——monorepo 工程结构、公共包、admin（NestJS）骨架、web（Vite + React）骨架、工程规范。
  RBAC、文件、知识库、Agent、Workflow 等业务模块一律不在本 spec 范围内；
  初期开发采用 SQLite 数据库（零外部依赖）；Redis/MinIO 等中间件不在本 spec 范围内。

---

## 1. 目标

提供一套可复用、可验收的应用初始骨架：

1. pnpm monorepo 单仓多包结构，统一构建/lint/类型配置；
2. 后端 admin：NestJS 应用装配流水线（前缀、校验、异常、Swagger、日志、优雅关闭）+ 基础健康探针；
3. 初期开发接入 SQLite 数据库（TypeORM，零外部依赖，后续可平滑迁移 PostgreSQL）；
4. 前端 web：Vite dev 代理、路由壳、统一请求层（apiFetch）、token 管理；
5. 全链路 traceId 日志能力（独立包，前后端可共用 logger 的 trace 机制）；
6. 明确的启动验收标准（基础健康探针即验收依据）。

---

## 2. 总体架构

```
guard-work/                        pnpm workspace 根
├── apps/
│   ├── admin/                     NestJS 后端（@guard-work/admin）
│   └── web/                       React 前端（@guard-work/web）
├── packages/
│   ├── logger/                    @guard-work/logger：pino 封装 + traceId
│   ├── shared/                    @guard-work/shared：前后端同源类型与纯函数
│   └── typescript-config/         共享 tsconfig 基座
├── biome.json                     lint / format（根级）
├── pnpm-workspace.yaml
└── package.json                   根 scripts（build/typecheck/test/lint/dev）
```

技术选型一句话理由：

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 后端框架 | NestJS 12 + Express 5 | DI/模块化成熟，与 Swagger/Config 等生态契合；v12 生态包（@nestjs/typeorm/config/swagger/testing）已全线发 12.x |
| 数据库（初期） | TypeORM 1.x + SQLite（better-sqlite3） | 零外部依赖、文件型库，clone 即跑；换驱动即可迁 PG |
| 前端 | Vite 8 + React 19 + react-router 8 + Tailwind 4 + shadcn/ui(Radix) | Vite 8 默认 Rolldown 构建；RR8 要求 Vite ≥7 + React 19，与 Vite 8 捆绑升级 |
| 日志 | pino 10（自封装 @guard-work/logger） | JSONL、高性能、mixin 注入 traceId |
| 测试 | Vitest 5（全仓单一框架） | 前后端同构共用一套 runner/配置/coverage；peer 兼容 Vite 6.4~8，与 NestJS 12 官方默认方向一致 |
| Lint/Format | Biome 2.5 | 单工具替代 ESLint + Prettier |

---

## 3. Monorepo 与工程基座

### 3.1 Workspace 划分

- `pnpm-workspace.yaml`：`apps/*`、`packages/*`；`onlyBuiltDependencies` 白名单 esbuild/bcrypt；pnpm 12 起对 workspace yaml 未知顶层键直接报错，新增键需对照官方 schema。
- 根 `package.json` scripts（全部 `pnpm -r` 递归）：
  - `build` / `typecheck` / `test`：递归执行各包同名脚本；
  - `lint` / `lint:fix`：`biome check .`；
  - `dev:admin`：先构建 `@guard-work/logger` 再 `nest start --watch`（admin 运行时依赖 logger 产物）；
  - `dev:web`：`vite` dev server。
- 约束：Node >= 22.12（Vitest 5 engines 硬性要求，且 Node 20 已 EOL），`packageManager: pnpm@12.x`（Rust 原生实现，命令/lockfile 格式与 11 兼容；CI 安装走 `npx get-pnpm` 或 corepack 固定版本）。

### 3.2 共享 TypeScript 配置（packages/typescript-config）

`base.json` 作为全仓基座，关键开关：

- `target: ES2022`、`module/moduleResolution: NodeNext`；
- `strict: true` + `noUncheckedIndexedAccess: true`（索引访问强制收窄）；
- `isolatedModules`、`declaration` + `declarationMap` + `sourceMap`。

各 app/package 的 tsconfig `extends` 该基座，按需覆盖（如 web 用 DOM lib）。

### 3.3 Biome 规范（根 biome.json）

- formatter：2 空格、行宽 100、双引号、带分号；
- linter：`recommended` preset；`organizeImports` 开启；
- CSS 支持 `tailwindDirectives`；
- 忽略 dist/node_modules/logs 等产物目录；
- 注：`apps/admin` 目前排除在 biome 范围外（历史迁移遗留，新代码遵循同一风格）。

---

## 4. 公共包

### 4.1 @guard-work/logger（packages/logger）

职责：全仓统一日志出口。pino 薄封装，产出 JSONL。

**模块结构**：`config.ts`（配置校验与默认值）、`context.ts`（AsyncLocalStorage trace 上下文）、`serializers.ts`（traceMixin + Error 序列化）、`logger.ts`（createLogger 工厂）。

**对外 API**：

| 导出 | 说明 |
| --- | --- |
| `createLogger(config)` | 创建 logger；`service` 必填，缺失启动期直接抛错 |
| `runWithTrace(options?, fn)` | 建立 traceId 作用域；上游有则沿用，缺省生成 UUID |
| `getTraceId()` | 读取当前上下文 traceId（无上下文返回 undefined） |
| `traceMixin` / `serializeError` | pino mixin 与 err 序列化器 |

**Logger 接口签名约定**：`msg` 在前、可选结构化字段在后（`logger.info(msg, fields?)`），`error`/`fatal` 支持 `(err, msg, fields?)` 重载；`child(bindings)` 绑定固定字段。

**输出通道**：

- stdout 始终输出 JSONL（保留采集器路线）；
- `file.enabled` 时追加本地文件（默认 `logs/<service>.log`，不做轮转）；
- 文件写入失败降级为 stderr 告警一次，**日志永不抛错拖垮业务**；
- 固定字段契约：`service`、`env`（time/level/msg 由 pino 生成，traceId 由 mixin 注入）。

**构建**：tsup 双产物（cjs `dist/index.js` + esm `dist/index.mjs` + d.ts），exports 条件导出（ESM/CJS 消费方各走对应 condition，pino 10 双格式兼容）。测试用 vitest，与全仓统一。

### 4.2 @guard-work/shared（packages/shared）

职责：前后端同源的契约与纯逻辑，消费方一律 `import ... from "@guard-work/shared"`。

- `src/api/common.ts`：分页与响应契约（`ApiResponse`/`PageQuery`/`PageResult`）；
- `src/index.ts` 为唯一入口，新增目录后在此补一行 re-export；
- 构建同为 tsup 双产物；测试用 vitest（原 jest 已移除，见 §5.7 全仓统一决策）。

### 4.3 @guard-work/typescript-config

纯配置文件包（`base.json`），见 §3.2，仅作为 devDependency 被 extends。

---

## 5. admin 后端骨架（apps/admin）

### 5.1 启动链路

```
main.ts                    显式 loadDotenv() → 解析 PORT（非法即退出）
  └── bootstrapApp()       应用装配（main.ts 与 e2e 共用，保证行为一致）
        ├── NestFactory.create(AppModule, { logger: AppLoggerService })
        ├── setGlobalPrefix("api")                    全局 /api 前缀
        ├── useGlobalPipes(ValidationPipe)            whitelist + transform，非法 400
        ├── useGlobalFilters(HttpExceptionFilter)     统一错误结构 + error 日志
        ├── SwaggerModule.setup("api/docs")           标题/版本取自 package.json，BearerAuth
        └── enableShutdownHooks()                     SIGTERM/SIGINT 优雅关闭
```

启动期失败策略：**要快、要响**——PORT 非法、env 校验失败均直接 `process.exit(1)` 并打印原因。

### 5.2 配置体系

- `ConfigModule.forRoot({ isGlobal: true, validationSchema, load: [...] })`；
- **env 校验（Joi，fail-fast）**：`infra/config/env.validation.ts` 定义必备变量，缺失/非法启动即终止；可选变量给默认值；
- **命名空间配置**：按领域拆分 `registerAs` 配置工厂，业务侧经 `config.get("<namespace>.<key>")` 读取，不直接读 `process.env`；后续接入存储/中间件时按同一模式新增配置工厂；
- `.env.example` 入库（含占位凭据 `change-me`），真实 `.env` gitignore；
- 端口约定：admin 默认 3001（`PORT` 可覆盖）；web dev 默认 5173。

### 5.3 模块骨架（AppModule）

```
AppModule (NestModule)
├── ConfigModule(global)      env 校验 + 命名空间配置
├── LoggerModule              AppLoggerService 提供者
├── DatabaseModule            TypeORM + SQLite（初期）
└── 业务模块若干               （不在本 spec 范围）

configure(): TraceMiddleware 应用 forRoutes("*")
（Express 5 下 "*" 通配符已废弃，改用正则路由匹配全部路径）
```

### 5.4 数据库接入（初期 SQLite）

- 选型：TypeORM 1.x + `better-sqlite3` 驱动（当前 13.x），数据库文件默认 `data/guard_work.sqlite`（gitignore）；
- 初期策略：`synchronize: true`，改实体即自动同步表结构，提升迭代效率；结构稳定后切 `synchronize: false` + migration 管理；
- `autoLoadEntities: true`，实体随业务模块 `forFeature` 注册，DatabaseModule 不感知具体实体；
- 命名空间配置 `db`（`registerAs`）：`DB_PATH` 可选，缺省用默认路径；
- 迁移路径：TypeORM 屏蔽驱动差异，后续迁 PostgreSQL 只换驱动与连接配置，entity/Repository 代码不变；0.3.x → 1.x 属大版本跳跃，`synchronize`/`autoLoadEntities`/`forFeature` 语义在升级后需经 §8 验收 #4 回归确认。

### 5.5 基础健康探针

`GET /api/health`（AppController，`@Public()` 免鉴权）：纯骨架探针，不接任何存储，返回 `{ status: "ok", timestamp, uptime }`，用于验证应用进程存活。后续可在此基础上扩展深度探活。

### 5.6 横切能力

#### 5.6.1 全链路 traceId（TraceMiddleware）

- 请求最早进入处（guards/pipes 之前）全局应用；
- 沿用上游 `x-trace-id` 请求头（非字符串/缺失时生成 UUID）；
- `runWithTrace` 建立 AsyncLocalStorage 作用域，全链路日志自动带同一 traceId；
- **响应头在 `next()` 之前写入**，保证异常响应也携带 traceId（前端可上报排障）。

#### 5.6.2 统一异常（HttpExceptionFilter）

- `@Catch(HttpException)` 兜底，统一错误响应结构：
  `{ statusCode, message, error, path, timestamp }`（traceId 在响应头 `x-trace-id`）；
- 每次异常用 logger 记一条结构化 error（method/url/status/path）。

#### 5.6.3 统一日志（AppLoggerService）

- 实现 Nest `LoggerService`，在 `NestFactory.create` 时替换框架 logger——Nest 框架日志（启动、路由映射）与业务日志统一走 workspace logger；
- `createLogger({ service: "admin", file: { enabled: true } })`：JSONL 落盘 `logs/admin.log` + stdout；
- 约定：Nest 风格方法 `optionalParams` 最后一个参数为 context（模块名）；业务侧直接用结构化方法 `info(msg, fields)` / `errorWithFields(msg, fields)` / `warnWithFields(msg, fields)`。

### 5.7 测试骨架

- **全仓统一 Vitest 5**（web / logger / shared / admin 单一测试框架，前后端同构不再维护双栈），jest 与 ts-jest 整体移除；
- admin 单测：vitest + `unplugin-swc`（esbuild 不产出 `design:paramtypes` decorator metadata，Nest DI 测试必须经 SWC 转译，这是 admin 接入 vitest 的唯一特殊配置点）；
- e2e：supertest + 独立 vitest e2e project（`test/` 目录），复用 `bootstrapApp()` 装配，保证与生产行为一致；
- 配置同源：vitest 直接复用各包 vite/tsup 配置解析逻辑（alias、exports 条件导出与 dev 行为一致），coverage 统一 `@vitest/coverage-v8`。

---

## 6. web 前端骨架（apps/web）

### 6.1 构建与 dev 代理

- Vite 8 + `@vitejs/plugin-react` + `@tailwindcss/vite`（Tailwind 4）；
- alias `@ → src`；
- `vite.config.ts` 从 `.env` 读取（配置优先）：
  - `VITE_PORT`：dev 端口，默认 5173；
  - `VITE_API_PROXY_TARGET`：`/api` 代理目标，默认 `http://localhost:${PORT || 3001}`（与 admin 默认端口对齐）；
  - proxy `/api → target`，`changeOrigin: true`；启动时打印一条端口/代理日志；
- scripts：`dev` / `build`（先 `tsc --noEmit` 再 vite build）/ `typecheck` / `test`（vitest，passWithNoTests）/ `preview`；测试与 dev 共用同一份 vite 配置，alias/代理行为天然一致。

### 6.2 应用装配

```
main.tsx
└── StrictMode → BrowserRouter → AuthProvider → App
                                                └── useRoutes(routes)   路由表驱动
```

- 路由集中在 `src/routes.tsx`（RouteObject 数组），登录/注册为公开路由，其余挂在 `RequireAuth` + `AppLayout` 之下，`*` → NotFound；
- UI 基座：shadcn/ui 风格组件位于 `src/components/ui`，工具函数 `src/lib/utils.ts`（cn 合并）。

### 6.3 统一请求层（lib/api.ts）

`apiFetch<T>(path, options)` 是全前端唯一请求出口：

- 自动补 `/api` 前缀；body 存在时加 `content-type: application/json`；
- 有 token 自动带 `Authorization: Bearer <token>`（token 存 localStorage，key `gw_token`，见 `lib/token.ts`）；
- **traceId 对接**：从响应头读 `x-trace-id`，错误归一为 `ApiError { message, traceId, status }`，便于前端上报排障；
- 401 处理：清 token 并跳 `/login`（登录/注册页除外，避免循环）；
- 错误消息解析：优先取后端 `body.message`（字符串或字符串数组 join）；
- 空响应处理：204 或 200 空 body 一律按 `undefined` 返回（先 `text()` 再判空 parse，避免 `json()` 对空体抛 SyntaxError 误判成功操作为失败）；
- 网络层失败统一抛「后端服务不可达」提示。

---

## 7. 日志规范（项目级约定）

所有开发的功能都需要有合理的日志输出，方便排查问题，统一遵守：

1. 一律走 `AppLoggerService`（admin）或 `@guard-work/logger`（包/脚本），禁止裸 `console.log`（启动前极早期错误除外）；
2. 结构化优先：业务日志用 `info/errorWithFields/warnWithFields` 传字段，字段原样落 JSONL；
3. 关键生命周期必打日志：启动装配完成、依赖连接就绪/异常、异常过滤命中；
4. 每条请求链路日志自动携带 traceId（mixin），无需手工传；
5. 日志中禁止出现明文密码/密钥；对外错误信息经 `sanitizeError` 脱敏。

---

## 8. 验收标准

骨架搭建完成的判定依据（均可脚本化验证）：

| # | 验收项 | 验证方式 |
| --- | --- | --- |
| 1 | monorepo 脚本贯通 | 根目录 `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿，且 `pnpm why vitest` 各包可达、lockfile 中无 jest/ts-jest 残留 |
| 2 | env fail-fast | 删除 `.env` 中必填项启动，进程立刻退出并报错 |
| 3 | 骨架探针 | `GET /api/health` → 200 `{ status: "ok" }` |
| 4 | SQLite 接入 | 空环境启动成功，`data/guard_work.sqlite` 自动创建，数据可写入并读回 |
| 5 | traceId 全链路 | 任意请求响应头含 `x-trace-id`；`logs/admin.log` 中该请求相关日志带同一 traceId |
| 6 | 统一错误结构 | 触发 4xx/5xx，响应体为 `{ statusCode, message, error, path, timestamp }` |
| 7 | Swagger | `/api/docs` 可访问，标题/版本与 package.json 一致 |
| 8 | 前端连通 | `pnpm dev:web` 打开 5173，经 /api 代理完成一次请求；401 自动跳登录 |
| 9 | 优雅关闭 | Ctrl+C 后进程正常退出，不挂起 |

---

## 9. 风险与遗留

| 项 | 说明 | 处理 |
| --- | --- | --- |
| `apps/admin` 未纳入 biome | 历史迁移遗留，风格靠人工维持 | 后续单独迁移（格式差异大，不宜一刀切） |
| logger 文件输出无轮转 | 开发留档用途，长期运行文件会膨胀 | 生产走 stdout + 采集器，不在骨架内解决 |
| 社区包 peer 未追平 Nest 12 | NestJS 12.0 刚于 2026-09 初转 latest，非官方生态包（jwt/passport 适配器/社区模块）peer 可能仍卡 `^11` | 骨架期依赖面小不受影响；后续新增依赖前先核对 v12 兼容，禁止用 npm overrides 强压 peer |
| admin 暂保持 CJS 构建 | Nest 12 核心包 ESM-first，经 Node `require(esm)` 兼容 CJS 应用；tsconfig 维持 NodeNext 不动，避免构建流水线连坐改造 | 业务稳定后再评估整体切官方 ESM + Rspack/SWC 管线（届时 §3.2 一并复审） |
| Vitest 5 强制 Node 22.12+ | engines 硬约束，低版本 Node 直接跑不起来 | 已随本次升级把 Node 基线提到 >= 22.12，CI/本地需同步 |
