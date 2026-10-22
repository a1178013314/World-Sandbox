# 世界沙盘 WHAT IF

**发出去之前，先看一遍。**

把一条即将落地的公告，放进一个 20 轮的群聊世界：谁会先反对、谁会沉默、哪句话会被截图——看清这些之后，再决定发不发、怎么发。

世界沙盘是一个多角色社会反应仿真系统。十几个有立场、有记忆、有信息盲区的角色在同一场景里互相反应，用户可以随时注入变量、从任意轮分叉对照，并在跑完后单独采访某个角色。

---

## 目录

- [它解决什么问题](#它解决什么问题)
- [核心能力](#核心能力)
- [种子包](#种子包)
- [快速开始](#快速开始)
- [常用脚本](#常用脚本)
- [工程结构](#工程结构)
- [一轮是怎么跑的](#一轮是怎么跑的)
- [主要接口](#主要接口)
- [测试与验收](#测试与验收)
- [设计文档](#设计文档)
- [已知限制](#已知限制)

---

## 它解决什么问题

方案在会议室里通常都能自洽，真正的风险发生在发出之后。而现有的替代手段各有缺口：

| 手段 | 缺口 |
| --- | --- |
| 焦点小组 / 问卷 | 慢、贵、样本少；人在被观察时倾向说场面话 |
| 舆情监测 | 只能事后知道，无法事前预演 |
| 内部开会推演 | 靠经验和嗓门，无法并行探索多种走向 |
| 一对一 AI 对话 | 只有「你问它答」，没有群体、立场、沉默和信息差 |

世界沙盘的答案是：给模型一群**立场不同、信息不同步**的人，让他们在同一套时间与在线规则下自行演化，再让决策者从中读出风险。

## 核心能力

- **造世界**：一句话 + 联网检索 + 结构化生成，60–90 秒产出一个带角色、立场、时段的种子包；也可直接用预置包，零模型调用。
- **跑 20 轮**：每轮依次经过排班、投递、规则门、模型门、应用、记账。空轮是合法结果。
- **上帝之手**：不暂停、不重跑，直接向群里投放一条已经发生的事实，角色只能反应、不能否认。
- **分叉对照**：从任意已完成轮次复制世界，只改一个变量，两个世界并排跑完，用于对比同一个「如果」。
- **采访**：跑完单独追问某个角色「你当时为什么没说话」，它只能用自己的记忆与可见事件回答，不知道就说不确定。
- **角色朗读**：每个角色固定音色，通过 OpenAI 兼容的 `/audio/speech` 连续朗读，把群聊变成可听的连续剧。
- **涌现卡与指标**：情绪温度、极化度、沉默率、升级指数（启发式）随时间变化，关键发言会被提炼成带原文引用的涌现卡。
- **可回放**：回放只重播已发生事件，不重新计算、不再次调用模型；SSE 断线重连只补缺失事件。

### 两条工程底线

1. **事件只追加、不修改**，是唯一客观真相；角色信念允许出错，信息差是产品的主要输出。
2. **错过即错过**：某角色某一轮不在场，就永久错过那一轮，事后不回溯补看。

## 种子包

仓库内置 6 个可直接演示的包（`packs/*.json`），固定 20 轮：

| id | 场景 | 角色数 |
| --- | --- | --- |
| `estate` | 翠湖花园 · 物业涨价 | 12 |
| `company` | 产品研发部 · 组织调整 | 8 |
| `pr` | 饮品品牌 · 声明之后 | 10 |
| `school` | 城南实验小学 · 校园餐 | 10 |
| `sanguo` | 柴桑 · 舌战群儒 | 10 |
| `xiyouji` | 白虎岭 · 三打白骨精 | 10 |

一句话生成的新包默认写入 `packs/generated/`（已忽略入库，可随时重新生成）。

## 快速开始

### 环境要求

- Node.js >= 22.12（见 `.nvmrc`）
- pnpm 11.13（`packageManager` 字段已锁定）
- 需要一个 OpenAI 兼容的 LLM 接口（跑轮/造人/造包）；不配也可用 `fake` provider 跑测试

### 安装与配置

```bash
pnpm install

# 后端配置：复制模板后填入模型服务地址与 key
cp apps/admin/.env.example apps/admin/.env
# 前端配置（可选，默认已指向 http://localhost:3001）
cp apps/web/.env.example apps/web/.env
```

`apps/admin/.env` 关键项：

```dotenv
PORT=3001
LLM_BASE_URL=https://<openai 兼容服务>/v1
LLM_API_KEY=<your-key>
SANDBOX_MODEL_ACT=claude-sonnet-5-5      # 跑轮 / 压缩 / 采访
SANDBOX_MODEL_CAST=claude-opus-4-7-thinking # 造角色卡
SANDBOX_MODEL_FORGE=claude-sonnet-5-5    # 一句话造包
SANDBOX_MAX_CALLS_PER_WORLD=120          # 单世界调用硬闸门
```

TTS、联网检索、缓存、并发等开关见 [`apps/admin/.env.example`](apps/admin/.env.example)，全部有默认值。

### 启动

```bash
pnpm dev          # 同时启动 admin(3001) 与 web(5173)
# 或分别启动
pnpm dev:admin
pnpm dev:web
```

启动后：

- 前端：<http://localhost:5173>
- 健康探针：<http://localhost:3001/api/health>
- Swagger：<http://localhost:3001/api/docs>

前端开发服务器已把 `/api` 代理到后端，无需额外配置 CORS。

## 常用脚本

在仓库根目录执行：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动前后端（先构建共享包） |
| `pnpm dev:admin` / `pnpm dev:web` | 单独启动后端 / 前端 |
| `pnpm build` | 构建全部 workspace 包 |
| `pnpm typecheck` | 先构建共享包，再全量类型检查 |
| `pnpm test` | 全量单元测试 + 后端 e2e |
| `pnpm lint` / `pnpm lint:fix` | Biome 检查 / 自动修复 |
| `pnpm verify` | lint → typecheck → test → build 全链路校验 |

> 后端测试统一走 `SANDBOX_LLM_PROVIDER=fake` 与内存数据库，不消耗真实调用。

## 工程结构

```text
.
├── apps/
│   ├── admin/                 # NestJS 12 后端：沙盘引擎 + SSE + SQLite/TypeORM
│   │   ├── src/modules/sandbox/
│   │   │   ├── controllers/   # packs / worlds / stream / 干预 / 采访 / 分叉 / 对比
│   │   │   ├── services/      # gate / feed / metrics / scheduler / delivery /
│   │   │   │                  # memory / actor / loop / world / cast / interview / tts
│   │   │   ├── llm/           # provider 抽象、缓存、预算、假模型
│   │   │   ├── prompts/       # act / cast / forge / interview / cards / compact / voice
│   │   │   └── entities/      # world / agent / event / delivery / round / call / snapshot / cache
│   │   └── test/              # health / sandbox / 预算 / 造包 / 验收 e2e
│   └── web/                   # Vite 8 + React 19 + Tailwind 4 前端
│       └── src/
│           ├── pages/         # worlds / world / world-debug / compare / login / register
│           ├── features/sandbox/  # 角色表 / 信息流 / 上帝之手 / 涌现卡 / SSE 订阅
│           └── lib/           # 统一请求层 / sandbox-api / token
├── packages/
│   ├── shared/                # 跨端类型与 schema（动作、世界、SSE 帧、种子包）
│   ├── logger/                # 结构化日志（traceId 贯穿）
│   └── typescript-config/     # 统一 TS 配置
├── packs/                     # 种子包（运行时 fs 读取，不进构建产物）
├── docs/world-sandbox/        # 设计 / 产品故事 / 实施 Spec
└── CONTEXT.md                 # 领域术语表（唯一用词来源）
```

依赖方向是硬约束：`web → shared`，`admin → shared/logger`，共享包不反向依赖应用。

## 一轮是怎么跑的

| 步骤 | 做什么 | 关键点 |
| --- | --- | --- |
| 01 排班 | 决定本轮谁在场 | 不在场者不接收任何投递 |
| 02 投递 | 把事件投给可见角色 | 可见性矩阵决定谁看得到 |
| 03 规则门 | 先算开口概率 | 纯函数判断，不通过直接沉默，**零调用** |
| 04 模型门 | 通过后才问模型 | 模型仍可选择不说话 |
| 05 应用 | 写回事件、信念、情绪、记忆 | 事件只追加 |
| 06 记账 | 更新指标与调用日志 | 预算与审计可查 |

因此系统跑得起来：

- **0 次模型调用**：规则门先判，不通过直接沉默；
- **1 份客观真相**：事件只追加、不修改；
- **∞ 次回放与分叉预览**：只读重播，不重新计算。

离线保障：上游模型不可用时 `SANDBOX_LLM_PROVIDER=fake` 仍能跑通完整演示链路；预算闸门超限即停，缓存与调用日志可审计。

## 主要接口

所有接口前缀 `/api`，请求体用 `class-validator` 校验，响应类型来自 `@ifss/shared`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/packs` · `/packs/:id` | 包列表 / 包详情 |
| POST | `/packs/forge` | 一句话 → 检索 → 生成并注册种子包 |
| POST | `/worlds/cast/preview` | 种子 → 可编辑角色卡草稿（不落库） |
| POST | `/worlds` | 创建世界（预置卡或提交编辑后的角色卡） |
| GET | `/worlds` · `/worlds/:id` | 世界列表 / 快照（角色、轮次、指标） |
| POST | `/worlds/:id/run` | 分段运行，`{ rounds?: number }` |
| POST | `/worlds/:id/stop` | 当前轮跑完后停止 |
| GET | `/worlds/:id/stream` | SSE 推轮次事件，断线可补发 |
| POST | `/worlds/:id/events` | 上帝之手：事实注入 |
| POST | `/worlds/:id/fork` | 从指定轮次分叉 |
| POST | `/worlds/:id/interview` | 采访角色 |
| GET | `/worlds/:id/cards` | 涌现卡 |
| GET | `/worlds/:id/compare/:other` | 双世界对照 |
| GET | `/worlds/:id/tts/:seq` | 单条发言朗读音频 |
| GET | `/worlds/:id/calls` | 调用日志（分页、可审计） |
| GET/POST | `/worlds/:id/export` · `/worlds/import` | 全量导出 / 导入 |

## 测试与验收

```bash
pnpm test        # 单元测试 + e2e（fake provider）
pnpm verify      # 提交前全链路校验
```

- 纯函数层（规则门、排序、指标、可见性、记忆、调度）都有独立单测；
- `apps/admin/test/*.e2e-spec.ts` 覆盖主链路、预算闸门、一句话造包与验收场景；
- 演示固定 20 轮，验收 e2e 同样按 20 轮断言。

## 设计文档

| 文档 | 内容 |
| --- | --- |
| [`CONTEXT.md`](CONTEXT.md) | 领域术语表，所有代码与文档用词的唯一来源 |
| [`docs/world-sandbox/2026-10-21-world-sandbox-design.md`](docs/world-sandbox/2026-10-21-world-sandbox-design.md) | 产品设计与论证 |
| [`docs/world-sandbox/2026-10-21-world-sandbox-spec.md`](docs/world-sandbox/2026-10-21-world-sandbox-spec.md) | 工程契约：数据模型、状态机、运行语义、API |
| [`docs/world-sandbox/2026-10-21-world-sandbox-product-story.md`](docs/world-sandbox/2026-10-21-world-sandbox-product-story.md) | 产品故事与商业价值 |

文档用词遵循 `CONTEXT.md`：**世界、种子包、角色、事件、交付、轮次、规则门、模型门、上帝之手、分叉、回放、采访、涌现卡**，不要混用近义词。

## 已知限制

- **无鉴权**：演示版沙盘接口全部公开，仅适合单用户演示环境；多人同时使用会串世界数据。
- **单机形态**：SQLite 单库 + 进程内调度，未做多实例与任务队列；横向扩展需替换存储与运行时。
- **模型依赖**：需要 OpenAI 兼容的 `/chat/completions`；TTS 需同源兼容 `/audio/speech`，未配置时朗读功能自动关闭。
- **指标口径**：升级指数为启发式合成值，不是概率，不得对外表述为预测置信度。

---

世界沙盘 WHAT IF · 6 个种子包 / 20 轮推演 / 可现场演示
