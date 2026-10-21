# 假如 / WHAT IF — 世界沙盘 实施 Spec

- 日期：2026-10-21
- 状态：已确认，可进入实现
- 父文档：[2026-10-21-world-sandbox-design.md](./2026-10-21-world-sandbox-design.md)（产品设计与论证，本文不重复）
- 术语：以仓库根 `CONTEXT.md` 为准，本文用词不得偏离
- 范围：在既有 `@ifss` monorepo 内落地「业主群」单包主线——造世界、跑轮、上帝之手、采访、名场面卡、分叉 A/B

---

## 1. 相对设计文档的偏离（已确认）

设计文档 `design.md` 是产品论证稿，本文是可实现的工程契约。以下是明确改变，实现时以本文为准：

| # | 设计文档 | 本文 | 理由 |
|---|---|---|---|
| 1 | Next.js 15 独立应用 + drizzle-orm | 复用 `@ifss` monorepo：`apps/admin`(NestJS) + `apps/web`(Vite React) + `packages/shared` | 仓库已有 SQLite/TypeORM/traceId 日志/Vitest/代理，重建基座是纯损耗 |
| 2 | 每个世界一个 SQLite 文件，分叉=复制文件 | 单库 `data/ifss.sqlite`，`world_id` 隔离，分叉=`INSERT..SELECT` 重写 | TypeORM 动态多数据源要管连接池，48h 内不划算 |
| 3 | 6 张表 | 7 张业务表 + 1 张缓存表（新增 `agent_snapshots`、`llm_cache`、`rounds.gated_ids`、`calls.purpose`） | 任意轮分叉、沉默归因、成本核算 |
| 4 | 回放靠「固定 seed + 缓存」保证逐字一致 | 回放=只读重播，**禁止重跑** | 一致性由结构保证，不靠概率 |
| 5 | SSE 推轮次事件 | 保留 SSE，但把「订阅」与「触发」拆开 | 注入不打断、多端可看、断线可补 |
| 6 | DashScope qwen | `claude-sonnet-5-5`（跑轮/压缩/采访）+ `claude-opus-4-7-thinking`（造人/名场面） | 仓库 `.env` 指向 `api.openai-next.com`，实测 sonnet 2–3s |
| 7 | 五个种子包 + 小说 scene 渲染 + `intent` 注入 | 只交付 `estate`；`intent` 返回 400 | 小说包的离场/内心独白/章节整块砍掉，避免半成品 |
| 8 | 上帝之手 `visibility=all` 穿透离线者 | 等价于一条群公告，**只投给 `effectiveRound` 的在场者** | 否则「上帝之手能穿透、普通消息不能」双标，信息差破功 |
| 9 | 每 4 轮最多 2 次 post 为硬规则 | 软约束：prompt 注入剩余配额，违反照常应用并留审计标记 | 硬失败会丢掉一轮里的好内容 |
| 10 | 保底「每轮至少 2 人开口」 | 只做到规则门层，模型层可全员 `ignore`；空轮是合法结果 | 空轮概率 <2%，而「没人说话」本身就是产品主张 |

---

## 2. 工程结构

### 2.1 目录

```
packs/estate.json                              运行时 fs 读取，不进构建产物
packages/shared/src/sandbox/
  ├── action.ts      AgentActionSchema / ActionKind
  ├── world.ts       WorldStatus / AgentProfile / 指标类型
  ├── stream.ts      SandboxStreamEvent 联合类型（SSE 帧）
  └── pack.ts        PackConfigSchema
packages/shared/src/index.ts                   补一行 re-export ./sandbox

apps/admin/src/modules/sandbox/
  ├── sandbox.module.ts
  ├── runtime.ts                 每个 world 一个 Subject<SandboxStreamEvent>
  ├── entities/                  world / agent / event / delivery / round / call / agent-snapshot / llm-cache
  ├── dto/                       class-validator 请求体
  ├── controllers/               packs / worlds / stream / intervention / interview / cards / compare / debug
  ├── prompts/                   act.ts / cast.ts / interview.ts / cards.ts / compact.ts（模板函数，非 .md）
  └── services/
      ├── gate.ts        p_speak 纯函数
      ├── feed.ts        score 纯函数
      ├── metrics.ts     指标纯函数
      ├── scheduler.ts   active 集合
      ├── delivery.ts    可见性矩阵
      ├── memory.ts      记忆/情绪更新
      ├── actor.ts       唯一构造 prompt、唯一校验动作
      ├── loop.ts        唯一编排者
      ├── world.ts       建世界/分叉/导入导出/状态机
      ├── cast.ts        种子 → 角色卡
      ├── interview.ts
      ├── cards.ts
      └── llm/
          ├── provider.ts         LlmProvider 接口
          ├── openai-provider.ts  原生 fetch 调 /v1/chat/completions
          ├── fake-provider.ts    按 prompt_hash 取 fixture，测试与 CI 用
          ├── cache.ts            llm_cache 读写
          └── budget.ts           调用计数与硬闸门

apps/web/src/
  ├── pages/worlds.tsx / world.tsx / world-debug.tsx / compare.tsx
  ├── features/sandbox/
  │   ├── cast-panel.tsx / feed-panel.tsx / god-panel.tsx
  │   ├── emergence-bar.tsx / metric-strip.tsx
  │   ├── create-world-dialog.tsx / interview-dialog.tsx / fork-dialog.tsx
  │   └── use-world-stream.ts
  └── lib/sandbox-api.ts
```

### 2.2 依赖方向（硬约束）

1. `packages/shared` 只包含 Zod schema、类型、纯常量。**不得 import DB、HTTP、Node 内置模块**。
2. `apps/admin` 与 `apps/web` 互不 import；跨端契约一律经 `@ifss/shared`。
3. `gate.ts` / `feed.ts` / `metrics.ts` / `scheduler.ts` / `delivery.ts` 是纯函数：不碰 DB、不碰 LLM、不读时间。时间一律由调用方以参数传入。
4. `actor.ts` 是唯一知道 prompt 与模型输出的文件。换模型、调 prompt 只动它和 `prompts/`。
5. `loop.ts` 是唯一决定「先做什么后做什么」的地方。注入、分叉、回放都不改循环，只改它读到的输入。

建议在 `biome.json` 加 overrides 固化第 3、4、5 条（禁止 `services/gate.ts` 等 import `entities/*`、`llm/*`），与仓库既有依赖方向检查风格一致。

### 2.3 新增依赖

| 位置 | 依赖 | 用途 |
|---|---|---|
| `packages/shared` | `zod` | action / pack / stream 契约 |
| `apps/admin` | `p-limit` | 单轮并发上限 |

不引入 `openai` SDK：Node 22 原生 `fetch` 足够，且代理走 OpenAI 兼容协议。不引入分词库：`relevance` 用中文 bigram 重叠。

### 2.4 配置（`sandbox` 命名空间）

沿用现有 `registerAs` + Joi 风格，全部给默认值，避免破坏现有启动：

| 变量 | 默认 | 说明 |
|---|---|---|
| `SANDBOX_LLM_PROVIDER` | `openai` | `openai` \| `fake` |
| `SANDBOX_LLM_BASE_URL` | `LLM_BASE_URL` | 复用根 `.env` |
| `SANDBOX_LLM_API_KEY` | `LLM_API_KEY` | 复用根 `.env` |
| `SANDBOX_MODEL_ACT` | `claude-sonnet-5-5` | 跑轮/压缩/采访 |
| `SANDBOX_MODEL_CAST` | `claude-opus-4-7-thinking` | 造人/名场面 |
| `SANDBOX_MAX_CALLS_PER_WORLD` | `120` | 硬闸门 |
| `SANDBOX_MAX_CONCURRENCY` | `6` | 单轮并发 |
| `SANDBOX_CACHE_ENABLED` | `true` | `llm_cache` 开关 |
| `PACKS_DIR` | `<repoRoot>/packs` | 包目录 |

`provider=openai` 且缺少 key 时启动即失败并打印原因（遵循仓库 fail-fast 约定）；单测与 e2e 显式设 `SANDBOX_LLM_PROVIDER=fake`。

---

## 3. 领域模型要点

**唯一不可动摇的一条**：`events` 是客观真相，`agents.belief` 是主观认知。两者之差就是仿真好看的原因。

**错过即错过**：某轮未被激活的角色，永久错过该轮全部消息——不产生 `delivery`，之后也不回溯补看。这条是信息差的唯一来源，也是「王阿姨第 3 轮仍要求先贴账」能成立的原因。代价是偶尔有人插话说旧话题，那恰是真实群聊的样子。

**沉默有三种，必须分开记**：

| 类型 | 判定 | 记账位置 | 事后表现 |
|---|---|---|---|
| 不在线 | 未被排班抽中 / 不在作息时段 | 不在 `rounds.active_ids` | 采访说「我那会儿没看手机」 |
| 已读不回 | 在场但模型返回 `ignore` | `rounds.silent_ids` | 群里有已读无回复，记忆已更新 |
| 想回没赶上 | 超时 / 模型失败 / Zod 降级 | `calls.ok = 0` | 下一轮可补一句「刚看到」 |

第四种实际存在但不进业务语义：**被规则门拦下**（没花钱、没调用）。单独落 `rounds.gated_ids`，用于区分「舍不得花钱」与「真的不想说」。

---

## 4. 数据模型

单库 `data/ifss.sqlite`，TypeORM `synchronize: true`，JSON 列用 `simple-json`（底层 TEXT），列名显式 `name:` 保持 snake_case。

```sql
CREATE TABLE worlds (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT,                    -- 分叉来源，null = 新建
  fork_round    INTEGER,                 -- 从第几轮分出
  title         TEXT NOT NULL,
  pack_id       TEXT NOT NULL,
  seed_json     TEXT NOT NULL,           -- { text, scene, timeSlots[], gateCoefficient, renderMode }
  cast_source   TEXT NOT NULL,           -- preset | generated
  rng_seed      INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  total_rounds  INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ready',  -- ready|running|paused|done
  error_text    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE agents (
  world_id      TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  profile_json  TEXT NOT NULL,           -- 不变
  belief_json   TEXT NOT NULL,
  memory_json   TEXT NOT NULL,
  state_json    TEXT NOT NULL,
  PRIMARY KEY (world_id, agent_id)
);

CREATE TABLE events (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id      TEXT NOT NULL,
  round         INTEGER NOT NULL,
  kind          TEXT NOT NULL,           -- post|reply|like|system|intervention
  actor_id      TEXT,
  target_id     TEXT,
  content       TEXT,
  payload_json  TEXT,                    -- { emotion, private_reason, thread_id, mentions[], quota_violation? }
  visibility    TEXT NOT NULL DEFAULT 'public',
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_events_world_round ON events (world_id, round);

CREATE TABLE deliveries (
  world_id      TEXT NOT NULL,
  event_seq     INTEGER NOT NULL,
  agent_id      TEXT NOT NULL,
  seen_round    INTEGER NOT NULL,
  salience      REAL NOT NULL DEFAULT 0.5,
  PRIMARY KEY (world_id, event_seq, agent_id)
);

CREATE TABLE rounds (
  world_id      TEXT NOT NULL,
  round         INTEGER NOT NULL,
  time_label    TEXT,
  active_ids    TEXT NOT NULL,           -- JSON string[]
  spoke_ids     TEXT NOT NULL,
  silent_ids    TEXT NOT NULL,           -- active - spoke
  gated_ids     TEXT NOT NULL,           -- 被规则门拦下、零调用
  metrics_json  TEXT,
  PRIMARY KEY (world_id, round)
);

CREATE TABLE calls (
  id            TEXT PRIMARY KEY,
  world_id      TEXT NOT NULL,
  round         INTEGER,
  agent_id      TEXT,
  purpose       TEXT NOT NULL,           -- act|act_repair|cast|compact|interview|card
  prompt_hash   TEXT NOT NULL,
  model         TEXT NOT NULL,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  latency_ms    INTEGER,
  raw_response  TEXT,
  ok            INTEGER NOT NULL,
  error         TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_calls_world_purpose ON calls (world_id, purpose);

CREATE TABLE agent_snapshots (
  world_id      TEXT NOT NULL,
  round         INTEGER NOT NULL,
  agent_id      TEXT NOT NULL,
  belief_json   TEXT NOT NULL,
  memory_json   TEXT NOT NULL,
  state_json    TEXT NOT NULL,
  PRIMARY KEY (world_id, round, agent_id)
);

CREATE TABLE llm_cache (
  prompt_hash   TEXT PRIMARY KEY,
  model         TEXT NOT NULL,
  raw_response  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
```

**为什么必须加 `agent_snapshots`**：`agents` 只存当前状态，世界跑到第 8 轮就再也回不到第 3 轮分叉。现场最大的翻车情形是「忘了及时点分叉」。每轮结束落 12 份 JSON（约 50KB/轮），换「任意轮分叉」。

**约束**：
- `agents.profile` 生成后不再改（角色一致性）。
- `memory.recent` 最多 20 条，只存 `{round, kind, ref, gist, salience}`，**不存全文**；全文在 `events`。
- `belief.unknown` 是刻意保留的字段，是误解与谣言的燃料。
- 角色 JSON 内不放模型名、API key、系统配置。
- `events` 只追加、不修改。`seq` 全局自增，同时充当 SSE 的 `Last-Event-ID`。

---

## 5. 状态机与生命周期

```
ready ──POST /run──> running ──跑满总轮次──> done
  ▲                     │
  │                     ├──POST /stop（当前轮跑完后生效）──> paused
  ├──POST /run──────────┴──预算超限 / provider 连续失败──────> paused + error_text
  └──本次请求的轮次跑完但未到总轮次────────────────────────────> ready
```

- 分段运行：`POST /run { rounds: n }` 只跑到 `currentRound + n`；正常跑完这一段回到 `ready`，可继续 `POST /run` 续跑。只有停表、预算超限、失败才落 `paused`。
- 每次 run 结束（`done` / `ready` / `paused`）都补发一帧权威 `snapshot`，前端不能只靠 `round_end` 推断状态。
- 末轮 `ready`（`currentRound === totalRounds`）没有可再跑的轮次，UI 按回放态处理：只提供分叉，不再显示“再跑一轮”或注入入口。
- 不设 `failed` 态。用 `paused + error_text` 表达「为什么停了」，因为那是给人看的字符串，不是分支条件。
- 同一世界同时只允许一个活跃 run：内存互斥 + 状态检查，第二次 `POST /run` 返回 409。
- `done` 的世界拒绝 `POST /run` 与 `POST /events`（提示「先分叉」）。
- 分叉只在 `ready` / `paused` / `done` 时允许；`running` 时分叉返回 409。
- 建世界失败（造人调用失败、种子非法）不落库，接口直接返回 4xx/5xx，事务回滚。

---

## 6. 一轮的运行语义

主循环（`loop.ts`）伪码：

```ts
for (const r of range(world.currentRound + 1, world.totalRounds)) {
  const active   = schedule(world.agents, r, world.rngSeed);      // 6.1
  const feeds    = buildFeeds(world, active, r);                  // 6.2，纯函数
  const gated    = active.filter(a => !passGate(a, feeds[a.id], r)); // 6.3
  const asked    = active.filter(a => !gated.includes(a));
  const acts     = await askAll(asked, feeds, r);                 // 6.4，p-limit
  applyActions(world, active, acts, r);                           // 6.5 写 events + deliveries
  updateMemories(world, active, acts, r);                         // 6.6
  writeRoundSnapshot(world, r, active, gated);                    // rounds + agent_snapshots
  publishMetrics(world, r);
  if (stopRequested(world)) break;                                // 状态转 paused
}
```

顺序约束：**先落库再 publish**。任何时刻断线，重连都能从 DB 补齐；SSE 不承担唯一真相。

### 6.1 排班（`scheduler.ts`）

```
时段      = pack.seed.timeSlots[(round - 1) % timeSlots.length]
候选      = agents where profile.activity.hours includes 时段小时数
被迫上线  = 上轮 @ 了我 或 回复了我 的角色（无视 hours，最多 2 人）
目标人数  = clamp(round(N × 0.35), 2, 6)
个体权重  = profile.activity.level × (连续 2 轮已发言 ? 0.5 : 1)
抽样      = 按权重轮盘赌，PRNG 由 world.rngSeed + round 派生（确定性）
输出      = active_ids ∩ 候选 ∪ 被迫上线，按 profile.influence 降序
```

空轮不兜底：8 轮 × 4 人 × 规则门通过率≈70%，全轮无人发言概率 <2%，而空轮本身是产品主张。UI 需有专门的空轮呈现，不得渲染成错误态。

### 6.2 Feed 排序（`feed.ts`）

只在**该角色本人的 `deliveries`** 里选，最多 8 条：

```
recency   = 1 / (1 + (round - event.round))
heat      = (likes + 2 × replies) / 候选集中最大值          // 归一化 0–1
relevance = 0.6 × 中文 bigram 重叠率 + 0.4 × (立场相反 ? 1 : 0)
influence = 作者 profile.influence
score     = 0.40×recency + 0.22×heat + 0.18×relevance + 0.08×influence + 0.12×random()
```

- `random()` 由 `(rngSeed, agentId, seq)` 派生，同一三元组恒定。
- 话题冷却：`thread_id` 最近 3 轮无 `reply` 时，`heat` 乘 0.5。
- `thread_id` = 根 `post` 的 `seq`，写在 `payload_json.thread_id`。

### 6.3 规则门（`gate.ts`）

```
p_speak = profile.activity.level
        × seed.gateCoefficient                            // estate = 1.00
        × (1 - min(state.silentRounds, 3) × 0.1)
        × contextMultiplier
clamp 到 [0.05, 0.95]，与 random() 比较

contextMultiplier（适用项相乘）：
  被@ / 被回复           1.8
  话题涉及自身利益        1.4    // relevance > 0.5
  潜水 ≥ 3 轮            1.2
  连续 2 轮已发言         0.5
```

规则门不通过者进 `rounds.gated_ids`，**不产生 `calls` 记录**——不花钱的沉默。

规则门层的保底：通过者不足 2 人时，按 `p_speak` 降序补足 2 人。补进来的人照常走模型门，仍可自己选 `ignore`。

### 6.4 模型门（`actor.ts`）

- 并发 `SANDBOX_MAX_CONCURRENCY`，单角色超时 25s，整轮超时 60s；超时按 `calls.ok=0`（想回没赶上）处理，不写事件。
- 请求参数：`temperature 0.8`、`max_tokens 300`、`response_format: { type: "json_object" }`。
- 校验链：Zod 通过 → 应用；失败 → **修复一次**（把校验错误回灌给模型，`purpose=act_repair`）→ 仍失败 → 降级 `ignore`，`private_reason="schema_invalid"`。
- `reply` / `like` 的 `target_id` 必须落在本轮 feed 内。不在 → 有 `text` 则降级为 `post`，无 `text` 则降级为 `ignore`。
- `post` / `reply` 字数上限（80 / 40）由 prompt 约束 + 落库时截断，不做硬失败。
- **post 配额是软约束**：prompt 注入「你最近 4 轮已发 N 次帖，还剩 M 次」；违反照常应用，但写 `payload_json.quota_violation = true`，在 debug 页可见。

### 6.5 应用与投递（`delivery.ts`）

动作按 `profile.influence` 降序、`agent_id` 字典序依次落库。事件 `seq` 顺序即因果顺序，不受网络竞态影响。

| 动作 | 写事件 | 投给谁 | salience |
|---|---|---|---|
| `post` | `kind=post`，`thread_id=自身 seq` | 本轮 `active_ids` 全体 | 0.5 |
| `reply` | `kind=reply`，`target_id` | 被回复者 + `mentions` + 作者 | 0.6 |
| `like` | `kind=like`，`target_id` | 仅目标作者 | 0.3 |
| `ignore` | 不写事件 | —— | —— |

额外投递规则：

- **种子事件**（`round = 0`）：投给全体角色，`salience = 0.9`。
- **`intervention` + `visibility=all`**：等价于一条群公告，只投给 `effectiveRound` 的 `active_ids`，**不穿透离线者**；`salience = 0.9`。
- **`intervention` + `visibility=agentId`**：含义是「有人单独告诉你」，投递给该角色，且**等他下一次上线时**才产生 `delivery`（不因离线而丢失）。
- 本轮未激活的角色不产生任何 `delivery`。

### 6.6 记忆与情绪（`memory.ts`）

| 内容 | 更新方式 |
|---|---|
| `memory.recent` | 每轮追加，上限 20 条，超限丢 `salience` 最低者；`gist` 取 `content` 前 30 字，**不调模型** |
| `belief.known` | 追加 `{ fact: content 首句, ref: seq }` |
| `belief.relations` | 被反对 −0.1，被附和 +0.05，clamp [−1, 1] |
| `state.mood` | 被反对/被@ +0.1，被附和 +0.05，每轮衰减 0.05，clamp [0, 1] |
| `belief.summary` | **规则拼接**最近 3 条 `known` + 情绪标签，不调模型 |
| `memory.summary` | 每 4 轮或 `recent > 12` 时一次 LLM 压缩，单世界上限 24 次 |

压缩 prompt 要求：200 字以内，保留「谁欠我、谁支持我、我立过什么 flag、我还没搞清的事」，不得编造。

### 6.7 指标（`metrics.ts`）

只做 7 个。「秘密暴露顺序」「离场人数」依赖小说包语义（`secret` 标记、`exit` 事件），estate 包内恒为 0，不做。

| 指标 | 公式 |
|---|---|
| 情绪温度 | `Σ(influence × intensity) / Σ(influence) × 100` |
| 极化度 | `H(支持/中立/反对，发言者影响力加权) / ln 3`：三足鼎立=1，全场一边倒=0 |
| 离线率 | `1 − active_ids / 总角色数` |
| 沉默率 | `silent_ids / active_ids`，`silent = 在场但未发言`（含门拦、模型忽略、失败）；离线不在分母里 |
| 传播速度 | `(reply 数 + @数) / max(1, post 数)` |
| 升级指数 | `100 × (0.4×反对占比 + 0.3×min(1, 传播速度/3) + 0.3×平均情绪强度)` |
| 张力曲线 | 3 轮滑动平均的 `(反驳+质问)/发言数` |

「反驳」= `reply` 且双方立场相反；「质问」= 文本含问号或「凭什么/为什么/多久/明细/依据/账」之一。**UI 必须标注「启发式」**，禁止包装成精确概率。

---

## 7. 种子包与角色卡

### 7.1 Pack schema

```ts
type PackConfig = {
  id: string;
  name: string;
  renderMode: "chat";                     // 本轮只实现 chat，字段保留
  seed: {
    text: string;                         // 开场公告
    scene: string;                        // 场景名，如「翠湖花园 1 栋业主群」
    timeSlots: string[];                  // ["09:00", "14:00", "21:00", "次日 08:00"]
    gateCoefficient: number;
  };
  recommendedRounds: number;
  initialCast: AgentProfile[];            // 12 张预置卡
};
```

`packs/estate.json` 内容取自设计文档附录 A + 附录 B：12 名角色（王阿姨、赵哥、陈律师、小美、老周、李工、陈经理、匿名、张姐、保安老刘、二胎爸爸、投资客），种子为翠湖花园物业涨价通知。`activity.hours` 按设计文档 §4.3 的示例分布，覆盖白天与晚间两段。

### 7.2 造世界两条路

| 路径 | 行为 |
|---|---|
| 预置 | `POST /worlds` 带 `cast: "preset"`，直接取 `pack.initialCast`，零 LLM 调用，用于演示保底 |
| 生成 | 先 `POST /worlds/cast/preview`（`seedText` + `castSize`，一次 `opus` 调用）→ 返回可编辑角色卡 → 用户确认后把数组随 `POST /worlds` 提交 |

生成路径的三条约束：成员 `id` 由后端重编为 `agent_1..agent_N`，**不采信模型给的 id**；`profile` 字段缺失由后端补默认值并记 warn 日志，`stance.issue` 缺失时用种子首句兜底；预览不落库、除 `calls` 外不写任何行，允许反复预览（成本按次计）。

### 7.3 Prompt 结构（`act`）

```
[system]  你是「{name}」，{role}。只根据下面的事实和记忆行动。
          不跳出角色、不总结、不解释规则。只输出 JSON，不要 markdown。
[角色卡]  姓名/身份/目标/恐惧/口吻/立场/影响力
[信念]    已知（带 ref）/ 未知 / 关系冷暖 / 当前 summary
[记忆]    最近 12 条 + 摘要
[本轮看到] 按 feed 顺序，带作者、轮次、反应数
[新事实]  本轮上帝之手注入（若有）
[动作约束] 可选动作、字数上限、剩余 post 配额
[输出]    {"action","target_id","text","emotion":{"label","intensity"},"private_reason"}
```

采访 prompt 只拼接「角色卡 + 信念 + 记忆 + 本人可见事件」，**不注入全局事件**；要求 2–4 句、保持口吻、不知道就说不确定；输出 `{ answer, cited: number[] }`，`cited` 必须过滤为本人可见的 `seq`，编造的 `seq` 直接丢弃。

名场面卡：输入本轮事件压缩 + 指标，输出 3 张 `{ type: "出圈"|"分歧"|"沉默"|"转折", quote, ref, why }`，`ref` 必须能对上真实 `seq`，否则该张丢弃。

---

## 8. LLM 层

### 8.1 Provider 接口

```ts
type LlmRequest = {
  purpose: "act" | "act_repair" | "cast" | "compact" | "interview" | "card";
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
};
type LlmResult = { raw: string; tokensIn: number; tokensOut: number; latencyMs: number };
interface LlmProvider { complete(req: LlmRequest): Promise<LlmResult>; }
```

两个实现：

- `openai-provider.ts`：原生 `fetch` 打 `{baseUrl}/chat/completions`，`response_format: json_object`。非 2xx / 超时 / 解析失败一律抛 `LlmError`，由 `actor.ts` 决定降级。
- `fake-provider.ts`：按 `prompt_hash` 取 fixture，保证同一 prompt 恒返回同一结果。单测、集成测试、CI 用它；**断网演示靠导入预跑世界，不靠它**（fake 文本是占位话术，上台不好看）。

### 8.2 缓存与预算

- `llm_cache` 全局按 `prompt_hash` 命中，命中不写 `calls` 的 token 成本但仍记一条 `ok=1` 的调用日志（便于 debug 页看「省钱」）。`SANDBOX_CACHE_ENABLED=false` 时绕过。
- `budget.ts` 每次调用前检查该 world 的累计 `calls` 数：超过 `SANDBOX_MAX_CALLS_PER_WORLD` → 抛出 `BudgetExceeded` → `loop.ts` 中止本轮、状态转 `paused`、写 `error_text`、SSE 发 `error` 帧。
- 单次调用 `max_tokens`：`act` 300 / `act_repair` 300 / `cast` 2400 / `compact` 400 / `interview` 500 / `card` 800。

---

## 9. API 契约

所有接口前缀 `/api`，无鉴权。请求体校验用 `class-validator`（沿用现有 `ValidationPipe`），响应体用 `@ifss/shared` 类型。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/packs` | 包列表（id/name/角色数/推荐轮次） |
| GET | `/packs/:id` | 完整 `PackConfig` |
| POST | `/worlds/cast/preview` | 草稿：`{ seedText, castSize }` → `AgentProfile[]`，不落库 |
| POST | `/worlds` | 创建：`{ packId?, seedText?, totalRounds?, cast: "preset" \| AgentProfile[] }` |
| GET | `/worlds` | 列表：`{ id, title, packId, status, currentRound, totalRounds, parentId, createdAt }[]` |
| GET | `/worlds/:id` | 快照：`{ world, agents, rounds, metrics, pendingInterventions }` |
| POST | `/worlds/:id/run` | `{ rounds?: number }`；已 running → 409 |
| POST | `/worlds/:id/stop` | 请求停止，当前轮跑完生效 |
| GET | `/worlds/:id/stream` | SSE，见 §10 |
| POST | `/worlds/:id/events` | `{ content, visibility: "all" \| agentId, effectiveRound?, mode }`；`mode=intent` → 400 |
| POST | `/worlds/:id/fork` | `{ atRound, intervention? }` |
| POST | `/worlds/:id/interview` | `{ agentId, question }` → `{ answer, cited }` |
| GET | `/worlds/:id/cards` | 无则生成一次 → `{ cards }` |
| GET | `/worlds/:id/compare/:other` | `{ worlds: [a, b], metrics: [a, b], cards: [{a, b}] }` |
| GET | `/worlds/:id/calls` | `{ purpose?, page?, pageSize? }` → 分页调用日志 |
| GET | `/worlds/:id/export` | 7 表全量 JSON |
| POST | `/worlds/import` | 导入 JSON → 新 `world_id` |

`/cards` 的结果按 `world_id` 缓存在进程内：首次访问生成一次，之后直接复用；服务重启后重新生成。生成或解析失败返回空数组，不阻断页面。`/compare` 复用两侧的 cards 缓存，因此两侧卡按生成顺序并排，不保证指向同一事件。

创建请求示例：

```json
// 预置保底
{ "packId": "estate", "cast": "preset", "totalRounds": 8 }

// 自定义种子：先 preview 拿到角色卡，人工编辑后连同 cast 数组提交
{ "seedText": "公司通知：本周五前提交去留建议", "totalRounds": 6,
  "cast": [{ "name": "部门总监", "role": "…", "goals": [], "fears": [], "voice": "…",
             "stance": { "issue": "组织调整", "position": "oppose", "intensity": 0.8 },
             "influence": 0.82, "activity": { "level": 0.7, "hours": [9, 14, 21] }, "can_see": [] }] }
```

`POST /worlds` 不提供 `cast: "generated"` 这种既有副作用又不可预览的形态。造人走两步：`POST /worlds/cast/preview`（草稿，不落库，返回角色卡数组）→ 用户编辑后把数组随 `POST /worlds` 提交。`castSize` 只属于 preview 接口。

### 9.1 分叉实现

```
POST /worlds/:id/fork { atRound, intervention? }
事务内：
  1. 校验 atRound ∈ [1, world.currentRound]
  2. 新建 world：parent_id=源, fork_round=atRound, current_round=atRound,
     total_rounds 沿用源世界, rng_seed = hash(源.rng_seed, atRound),
     status='ready', cast_source 沿用
  3. 复制 agents（profile 不变），用 agent_snapshots(atRound) 覆盖 belief/memory/state
  4. 复制 events / deliveries / rounds / agent_snapshots 中 round <= atRound 的行
  5. intervention 存在则写一条 kind='intervention', round=atRound+1 的事件（不写 delivery）
返回 { id }
```

`current_round = atRound` 表示「第 `atRound` 轮已经跑完，下一轮从 `atRound+1` 开始」；因此从末轮分叉时新世界没有剩余轮次，UI 只保留分叉与回放。

`events.seq` 是全库 `AUTOINCREMENT`，不是每世界编号，所以分叉复制时事件会拿到新 `seq`。事务内维护 `seqMap`，同步重映射 `payload.thread_id`、`belief.known.ref`、`memory.recent.ref`、`deliveries.event_seq`、`agent_snapshots` 中的引用，保证新世界内部引用自洽；代价是「与源世界逐字段相等」只能比较内容，不能比较 `seq`。SSE 的 `Last-Event-ID` 只在一个世界内使用，跨世界不依赖 seq 对齐。

---

## 10. SSE 协议

`GET /api/worlds/:id/stream`，`Content-Type: text/event-stream`，必须设 `X-Accel-Buffering: no`、`Cache-Control: no-cache`，每 15s 发一次注释行 `: ping`。

```
event: snapshot      data: { world, agents, rounds, metrics, pendingInterventions }
event: round_start   data: { round, timeLabel, activeIds, gatedIds }
event: action        data: { seq, round, kind, actorId, targetId, content, emotion }
event: intervention  data: { seq, round, visibility, content, delivered?: true }
event: round_end     data: { round, spokeIds, silentIds, metrics }
event: error         data: { round, code, message }
event: done          data: { rounds }
```

- 连上先发 `snapshot`，前端据此整体重置状态（不做增量猜测）。SSE 的 `event:` 行是事件类型，`data:` 只放 payload；前端必须把两者合回 `SandboxStreamEvent`。
- 每次 run 结束补发一帧 `snapshot`（见 §5），避免前端停留在 `running`。
- 断线重连：浏览器发送 `Last-Event-ID` 头；服务端同时接受 `?lastEventId=` 查询参数作为兜底。补发 `events.seq > lastId` 的 `action` / `intervention`，再补一帧 `snapshot` 校准轮次与指标。
- 实时 `intervention` 帧在该注入真正投递进某一轮时发布，带 `delivered: true`；历史回放帧不带 `delivered`，前端按 `round <= world.currentRound` 判断是否已生效。未到生效轮次的注入只留在 `pendingInterventions`，不进入群聊 feed。
- 重复投递按 `seq` 去重，前端以 `seq` 为 key 渲染。
- 世界未运行时也可以连（用于回放）：此时只有 `snapshot` 与按需补发的历史事件。

---

## 11. 前端设计

### 11.1 路由（全部公开，不进 `RequireAuth`）

| 路径 | 页面 |
|---|---|
| `/` | 世界列表 + 新建入口 |
| `/world/:id` | 三栏主界面 |
| `/world/:id/debug` | 调用日志 |
| `/compare/:a/:b` | A/B 对比（`/compare/:a/:b` 中 `b` 缺省时列出可对比世界） |

新增 `SandboxLayout`：顶栏展示 brand、场景名、种子摘要、`已跑 / 总轮次`、回放/实时徽标、角色数。不复用 `AppLayout`（后者带登录态与侧边导航，与沙盘全屏三栏冲突）。

### 11.2 三栏

| 区域 | 内容 | 数据源 |
|---|---|---|
| 左 `cast-panel` | 头像（取姓首字）、姓名、身份、立场标签、影响力条、状态徽标（活跃/潜水/已读不回/被门拦） | `agents` + 当前轮 `rounds` |
| 中 `feed-panel` | 按轮分组；`post` 气泡、`reply` 缩进挂靠、`like` 小计数、每轮底部一条「N 人在线 · M 人未发言 · K 人被门拦」；轮次分隔条含 `time_label` | `events` + `rounds` |
| 右 `god-panel` | 注入输入框 + 快捷事件 chips（停水 / 名单泄露 / 涨价追加 / 电梯坏了）+ 分叉按钮 + 指标迷你条 + 采访入口 + 待生效注入列表 | 接口 + `snapshot` |
| 底部 `emergence-bar` | 3 张名场面卡（类型 / 引用原文 / 为什么），点击滚动到对应 `seq` | `/cards` |

### 11.3 `use-world-stream.ts`

- 用原生 `EventSource`（不走 `apiFetch`，SSE 不走 XHR 封装）。
- 收到 `snapshot` 时整体替换状态，随后按 `seq` 追加事件。
- 断线自动重连：1s / 2s / 4s / 8s / 16s，最多 5 次；超过后置为「已断开，点击重连」。
- 消息错峰淡入（每 120ms 一条），`round_start` 后显示「3 人正在输入…」的过渡态，遮住 4–6 秒的模型等待。

### 11.4 交互态清单（不得省略）

| 状态 | 呈现 |
|---|---|
| 世界为空（无事件） | 显示种子原文 + 「跑第 1 轮」主按钮 |
| 正在跑 | 轮次进度条 + 正在输入的角色头像 |
| 空轮 | 「这一轮，没有人说话」+ 提示沉默率上升 |
| 已跑满 | 顶部「回放模式」徽标 + 采访/分叉/看卡入口 |
| 注入排队中 | 右栏「第 N 轮生效」胶囊 + 可撤销（撤销=写一条 `system` 事件标记作废） |
| 模型失败降级 | 不弹错误；该角色状态显示「想回没赶上」 |
| 预算超限 | 顶部黄色横幅 + `error_text` + 建议分叉 |

---

## 12. 分叉与对比

- 分叉入口在右栏，默认 `atRound = current_round`，可下拉选任意历史轮（依赖 `agent_snapshots`）。
- 分叉完成立即跳转新世界，并提示「已从第 N 轮分出，原世界不受影响」。
- 对比页只放：4 个指标（情绪温度 / 沉默率 / 升级指数 / 极化度）的双列数值 + 3 组名场面卡并排。不做长报告、不做图表联动。
- 对比页必须显式标注两个世界的 `fork_round` 与各自 `current_round`，避免拿不同长度的世界比指标。

---

## 13. 错误处理与降级矩阵

| 场景 | 处理 | 用户可见 |
|---|---|---|
| 模型返回非法 JSON | 修复一次 → 仍失败降级 `ignore` | 该角色显示「想回没赶上」 |
| 单角色超时 25s | 记 `calls.ok=0`，不写事件 | 同上，下一轮可补「刚看到」 |
| 整轮超时 60s | 结束本轮，已完成动作照常落库 | 轮次分隔条标注「部分超时」 |
| provider 连续失败 3 轮 | `paused` + `error_text` | 黄色横幅 + 重试按钮 |
| 预算超限 | 停止，`paused` | 横幅提示剩余轮次可用「fake + 导入」 |
| 同一世界重复 run | 409 | toast「这世界正在跑」 |
| `done` 世界注入/再跑 | 400 | 提示「先分叉」 |
| 末轮 `ready` 再跑/注入 | 400 | 没有剩余轮次；UI 按回放态只给分叉 |
| 分叉时 `atRound` 越界 | 400 | 下拉框禁用越界轮次，理论上不可触发 |
| SSE 断开 | 前端重连 + `snapshot` 重置 | 顶栏「重新连接中」 |
| 包文件缺失/非法 | 启动时 warn 日志，`/api/packs` 跳过该项 | 新建面板不显示该包 |

日志一律走 `AppLoggerService`，禁止裸 `console.log`；每次 LLM 调用记一条结构化日志（`purpose / model / latency / tokens / ok`），traceId 由现有 middleware 注入。

---

## 14. 测试策略

### 14.1 纯函数单测（先写）

| 文件 | 断言要点 |
|---|---|
| `gate.spec.ts` | 各 `context_multiplier` 组合、`silentRounds` 衰减、clamp 边界 0.05/0.95、被门拦下不产生调用 |
| `feed.spec.ts` | 同 seed 两次排序完全一致、只出现本人 `deliveries` 中的事件、话题冷却使 `heat` 减半、返回 ≤8 条 |
| `metrics.spec.ts` | 手算样例逐项比对；极化度极值（全场一边倒=0，三足鼎立=1）；空对象返回 0 不抛错 |
| `delivery.spec.ts` | post/reply/like/ignore × 四类目标的投递矩阵；离线者零投递；定向注入等上线才交付 |
| `action.spec.ts` | 合法动作通过；`ignore` 带 text 被拒；`reply` 缺 `target_id` 被拒；超长文本被截断而非抛错 |
| `scheduler.spec.ts` | 目标人数 clamp、`hours` 过滤、被迫上线优先、同 seed 可复现 |

### 14.2 集成测试（`fake` provider + 临时 SQLite）

- 跑 3 轮：`active = spoke ∪ silent ∪ gated` 恒成立；`events.seq` 单调；回放序列与 DB 一致。
- `fork(atRound=2)`：新世界 `round ≤ 2` 的 `events` 与源世界逐条内容相等（`kind/round/actor/target/content`；`seq` 允许重映射）；`round > 2` 为空。
- 采访一个目标轮次不在线的角色：`cited` 为空或不含该轮事件。
- 预算设为 3 次后 `run`：状态 `paused`，`error_text` 含 "budget"。
- 注入 `visibility=all` 后：只有 `effectiveRound` 的 `active_ids` 产生 `delivery`。

### 14.3 e2e（supertest）

`health` → `GET /packs` → `POST /worlds(preset)` → `POST /run` → SSE 首帧 `snapshot` → `POST /fork` → 并发第二次 `POST /run` 返回 409。

### 14.4 前端

`use-world-stream.spec.ts` 用假 `EventSource` 测：`snapshot` 重置、按 `seq` 去重、断线退避次数、重连后补发不重复。页面只做渲染 smoke（happy-dom），不追求交互覆盖率。

---

## 15. 验收标准

实现完成判定，均可脚本化或现场复现：

1. `estate` 包 12 角色 8 轮跑完 ≤ 120 秒，`calls ≤ 120`。
2. 任意一条消息可在 `/world/:id/debug` 追溯到 `round + agent + prompt_hash + 耗时`。
3. 跑到中途强行断开 SSE 再重连，前端消息序列与 DB `events` 一致——不重复、不丢。
4. 第 3 轮注入「停水 6 小时」，第 4 轮至少 2 个角色在该话题下发言。
5. `fork(atRound=N)` 后两个世界第 1–N 轮 `events` 内容一致（`seq` 可因全局自增重映射），第 N+1 轮起可分道；仅当源世界 `totalRounds > N` 时才存在可分道的后续轮次。
6. 采访一个在该轮不在线的角色，回答明确说「没看到 / 不知道」，`cited` 为空。
7. 至少 2 轮出现 `silent_ids` 非空，且 `gated_ids`（零调用）与模型 `ignore`（有调用）在 debug 页可区分。
8. 断网时 `POST /worlds/import` 导入预跑世界，能完整回放 8 轮并正常采访。
9. `pnpm verify` 全绿（lint / typecheck / test / build）。

---

## 16. 排期（32 小时）

| 时段 | 产出 | 完成标志 |
|---|---|---|
| H0–H3 | shared 契约 + 8 张 entities + `packs/estate.json` + `POST /worlds(preset)` | curl 能建世界并读回 12 个角色 |
| H3–H7 | `gate` / `feed` / `delivery` / `metrics` / `scheduler` + 单测 | `pnpm test` 中纯函数全绿 |
| H7–H12 | `actor` + provider + `loop` + `POST /step` | 控制台能跑完一轮并看到 12 人里的 4 条消息 |
| H12–H18 | SSE + 三栏 UI 接真数据 | 浏览器里能看着世界跑 8 轮 |
| H18–H22 | 上帝之手 + 采访 + 名场面卡 | 三个动词闭环 |
| H22–H26 | fork + 对比页 + debug 页 | A/B 可视化 |
| H26–H30 | 预跑世界 + 导入导出 + 断网演练 | 拔网线仍能演 |
| H30–H32 | 3 分钟彩排 + 异常态清单核对 | 能上台 |

若只剩 16 小时：砍对比页与 debug 页，保「造世界 + 跑 6 轮 + 注入 + 采访」。

---

## 17. 风险与未决

| 风险 | 兜底 | 备注 |
|---|---|---|
| 模型 JSON 不稳定 | `json_object` + Zod + 修复一次 + 降级；`fake` provider 兜底测试 | 已设计 |
| Vite dev 代理缓冲 SSE | 先在 `/api/worlds/:id/stream` 上验证；若缓冲则直连 `http://localhost:3001` | 需在 H12 验证 |
| 单轮 4–6 秒现场等待 | 前端错峰动画 + 「正在输入」过渡态 | 已设计 |
| 12 角色文本同质化 | `voice` 字段 + 立场相反者在 feed 加权 + 每个角色独立 memory | 需实跑调 prompt |
| TypeORM `synchronize` 与 `simple-json` | 全部 JSON 列用 `simple-json`，不手写 migration | 与现有仓库一致 |
| 分叉复制遗漏表 | 集成测试断言 7 表行数与逐字段相等 | 已列入 §14.2 |
| `opus` 造人质量 | 生成后进可编辑预览，人工兜底 | 已设计 |

**未决（待实现期确认）**：
1. `estate.json` 里 12 人的 `activity.hours` 具体取值——需按「白天 9/14 点、晚间 21 点、次日 8 点」四档实测调参，使沉默率落在设计文档 D5 的 40%–50%。
2. 名场面卡的「为什么」由模型生成还是规则模板——先用模型，质量不足再降级为规则。
3. 对比页是否需要把「分叉后各跑几轮」做成一次性操作（当前设计是分别手动跑）。

---

## 18. 落地偏差与补充（2026-10-21）

以下为实际实现相对前文的差异，均已由测试覆盖；阅读实现时以本节为准。

| 主题 | 实际落地 | 原因 |
|---|---|---|
| HTTP 前缀 | 所有接口挂在 `/api` 下（如 `/api/worlds/:id/stream`） | 与既有 admin 应用一致 |
| LLM provider | `fake` / `openai` 两档由 `SANDBOX_LLM_PROVIDER` 切换；真实档走 OpenAI 兼容协议，模型名与 base URL 来自环境变量 | 现场用 `.env` 指向兼容网关；CI 与离线测试不触网 |
| 分段运行 | 跑完本次请求的轮次但未到总数 → `ready`，并补发权威 `snapshot`；停表/失败才是 `paused` | 否则分段演示后前端停在 `running`，无法继续 |
| 末轮 `ready` | 视为回放态：前端只给分叉，注入与再跑不展示；后端仍返回 400 | `currentRound === totalRounds` 时没有可跑的下一轮 |
| 分叉轮次 | 新世界 `currentRound = atRound`（第 N 轮已跑完），`totalRounds` 沿用源世界 | 保证第 1–N 轮内容一致，从 N+1 轮开始分道 |
| 分叉 seq | 复制事件因全局 `AUTOINCREMENT` 重编 `seq`，并同步重映射 thread / belief / memory / delivery / snapshot 引用 | SQLite 单库全局自增，无法按世界保留原 seq |
| 极化度 | `H(支持/中立/反对，影响力加权) / ln 3`（三足鼎立=1，一边倒=0） | 与设计原公式方向相反；测试与 UI 均按「分歧越大越高」解释 |
| 沉默率 | `silent_ids / active_ids`；离线单独用 `offlineRate` | 拆开后才能分别观察「不在场」与「在场不说话」 |
| SSE 注入帧 | 实际投递时才发，带 `delivered: true`；回放帧不带，前端按轮次判断 | 避免未来轮注入提前出现在群聊里。重连额外支持 `?lastEventId=` |
| 名场面卡 | 进程内按世界缓存；`/compare` 按生成顺序 zip 两侧卡片；重启后重新生成 | 卡是展示物料，不落库；空结果不阻断页面 |
| 导入 | 导入为全新 `world_id`，事件 `seq` 重映射，`running` 落为 `paused` | 避免与现有世界的 seq 冲突，也避免导入即自动开跑 |
| 调试追溯 | `/calls` 分页 + `snapshot.rounds` 对照；门拦=零调用，模型忽略=有 `ok=1` 调用但无事件 | 不额外造 debug 专用表，直接用现有审计数据 |
| 假模型 | 空事实占位「（无）」不再拼进发言；卡片固定引用首个可见 seq | 假模型只服务测试与兜底演示，不追求内容质量 |
