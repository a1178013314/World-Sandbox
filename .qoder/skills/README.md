# 整合 DDD 流程和技能

> 在现有流程（**brainstorming_caveman 出 spec → goal 模式开发（karpathy-guidelines + TDD）→ 人工复核**）
> 上嫁接 DDD 的完整整合包。原技能全部保留，只做小补丁；术语沉淀由 `domain-modeling` 纪律承担。
>
> 分析背景文档见 `../ddd/DDD流程与技能使用指南.md`（mattpocock-skills 的 DDD 落地思路）。

**一句话亮点**：以 `CONTEXT.md` 统一语言为轴，用最小补丁（原技能不拆不动）把 **DDD（术语纪律）+ SDD（spec 驱动开发）+ TDD（红绿命名）+ Karpathy（先想后写、防过度设计）** 焊进现有工作流。

---

## 1. 整合后的流程

```
阶段1  spec（brainstorming_caveman，已打补丁①）
  ├─ 探索上下文时先读 CONTEXT.md（若存在）
  ├─ 一次一问澄清时，同步挑战模糊/冲突术语
  ├─ 设计新增"领域术语"一节
  └─ 终态：spec 落盘 + 术语即时写入 CONTEXT.md（+ 重大决策写 ADR）
        │
        ▼
阶段2  goal 模式开发（补丁★注入 + 补丁②③）
  ├─ 规则注入：命名与接口设计遵循 CONTEXT.md（见 §5 提示词）
  ├─ karpathy-guidelines：术语缺失/冲突 → 停下提出，绝不自造词
  └─ test_driven_development：测试命名、REFACTOR 改名必须用 CONTEXT.md 词汇
        │
        ▼
阶段3  人工复核（可选，用 codebase-design 词表）
  □ 新模块是深还是浅？  □ 接口即测试面？
  □ 真接缝还是假接缝（一个 adapter=假）？  □ 命名符合 CONTEXT.md？
        │
        ▼
阶段4  周期体检 / 存量改造：/improve-codebase-architecture（已纳入本包）
       Explore 扫浅模块 → HTML 报告选候选 → grilling 循环中由 domain-modeling
       反向沉淀 CONTEXT.md/ADR，领域模型作为改造副产品逐步长齐
```

## 2. 使用流程（拿到一个需求，实际怎么一步步用）

> 操作视角：每步写清「你说什么 / 触发哪个技能 / 产出什么」，与 §1 的架构视角对应。

```
Step 0  准备（每个仓库一次性）
  若还没有术语表，不用手动建——首个术语敲定时 brainstorming_caveman 会懒创建 CONTEXT.md
        │
        ▼
Step 1  出 spec ── 说「帮我设计 X」/ 显式 /brainstorming_caveman
  → 它一次一问澄清、挑战模糊术语、给 2-3 方案、逐节确认
  ✔ 产出：docs/specs/YYYY-MM-DD-<topic>-design.md + CONTEXT.md 术语（+ 重大决策 ADR）
        │
        ▼
Step 2  （可选）拷问 spec ── 说「grill 这份设计」/ /grilling
  → 对已成文 spec 逐分支追问、暴露未审视假设（brainstorming 是生成器，grilling 是检验器）
  ✔ 产出：spec 里的漏洞被问清并回改，无新文件
        │
        ▼
Step 3  goal 模式开发 ── 用 §5 注入语 + /karpathy-guidelines + /test_driven_development
  → 命名/接口遵循 CONTEXT.md；术语缺失或冲突就停下提问，绝不自造词
  ✔ 产出：红绿循环下的代码 + 测试（测试名用 CONTEXT.md 词汇）
        │
        ▼
Step 4  人工复核（可选）── 用 codebase-design 词表四项检查
  □ 新模块是深还是浅？  □ 接口即测试面？
  □ 真接缝还是假接缝？   □ 命名符合 CONTEXT.md？
        │
        ▼
Step 5  存量改造 / 周期体检（按需）── /improve-codebase-architecture
  → Explore 扫浅模块 → HTML 报告选候选 → grilling 循环中由 domain-modeling 反向沉淀
  ✔ 产出：架构改造候选 + 逐步长齐的 CONTEXT.md/ADR
```

**串起来的一句话**：`brainstorming_caveman`（设计）→ `grilling`（检验，可选）→ `karpathy + TDD`（开发）→ 人工复核 → `improve-codebase-architecture`（体检，按需）。

> 最小闭环：只想快速推进一个小需求，跑 **Step 1 → Step 3** 即可；Step 2/4/5 都是按需加装的质检环节。

## 3. 目录内容

```
skills/
├── brainstorming_caveman/     ← 补丁①（SKILL.md + SKILL.zh-CN.md 均已改）
├── karpathy-guidelines/       ← 补丁②（第 1 条加一行术语规则）
├── test_driven_development/   ← 补丁③（RED 要求 + REFACTOR 命名各加一处）
├── domain-modeling/           ← 原样复制（DDD 核心纪律，含 CONTEXT-FORMAT.md、ADR-FORMAT.md）
├── codebase-design/           ← 原样复制（复核词表，含 DEEPENING.md、DESIGN-IT-TWICE.md）
├── improve-codebase-architecture/ ← 原样复制（存量改造/周期体检入口，含 HTML-REPORT.md）
└── grilling/                  ← 原样复制（improve-codebase-architecture 第3步依赖，缺失则不自洽）
```

## 4. 补丁清单（相对原技能的全部改动）

### 补丁① brainstorming_caveman（6 处，对应 §1 阶段1 的四个分支）

| 位置 | 改动 |
|---|---|
| 检查清单 1 | 探索上下文时先读 `CONTEXT.md`（统一语言） |
| 检查清单 2 | 提问中出现模糊/多义术语时按 domain-modeling 纪律当场挑战 |
| 检查清单 | 新增第 6 项"沉淀领域模型"：完成态 = spec + CONTEXT.md 同时落盘 |
| 呈现设计 | 覆盖清单新增"领域术语（统一语言）"一节 |
| 设计完成后 | 新增"术语表与决策（DDD）"段：即时写入、懒创建、ADR 三条件 |
| 关键原则 | 新增"共享语言"：术语先于命名敲定，下游必须复用 |

### 补丁② karpathy-guidelines（1 处）

第 1 条"先思考再编码"新增：*需要的领域术语在 `CONTEXT.md` 中不存在、或用法与定义冲突 → 停下提出，绝不默默发明词汇。*

### 补丁③ test_driven_development（2 处）

- RED 段"要求"新增：*测试名中的领域术语来自 `CONTEXT.md`*（配例："Order is materialized" 而非 "file is created"）
- REFACTOR 段"改善命名"加注：*领域词汇必须与 `CONTEXT.md` 一致*

Iron Law、红绿循环等主体规则**一字未动**——DDD 与 TDD 正交，只借命名纪律。

## 5. goal 模式注入语（补丁★，成本≈0 收益最大）

加到给 goal 模式 agent 的规则文件（AGENTS.md / 系统提示词 / spec 模板头部）：

```
命名与接口设计遵循仓库根目录 CONTEXT.md 的术语；发现术语缺失或冲突时，
按 domain-modeling 的挑战规则提出，不要自造词。
```

## 6. 安装

本目录三个补丁版技能**替换**原位置的同名技能（名字未改，调用方式不变）：

```bash
BASE="/Users/axl/Desktop/code/AI_Special_Research/常用插件/整合ddd流程和技能/skills"
# 1) 替换 brainstorming_caveman 与 karpathy-guidelines（原在 常用插件/skills/）
cp "$BASE/brainstorming_caveman/"*   ".../常用插件/skills/brainstorming_caveman/"
cp "$BASE/karpathy-guidelines/"*     ".../常用插件/skills/karpathy-guidelines/"
# 2) 替换 test_driven_development（原在 .qoder/skills/）
cp "$BASE/test_driven_development/"* ".qoder/skills/test_driven_development/"
# 3) 新装 DDD 技能到 .qoder/skills/（模型可调，供上面三个技能引用）
cp -R "$BASE/domain-modeling" "$BASE/codebase-design" "$BASE/improve-codebase-architecture" "$BASE/grilling" .qoder/skills/
```

> 原文件在 git 管理下可直接回滚；`常用插件/skills/` 与 `.qoder/skills/` 中的原版**本次未被修改**，
> 本目录只是整合产物，替换与否由你是否执行上述安装步骤决定。

## 7. 未纳入的部分及理由

| 项 | 理由 |
|---|---|
| grill-with-docs | 与 brainstorming_caveman 的访谈循环重叠，补丁①已吸收其纪律，避免两个"追问引擎"打架；但 grilling 作为 improve-codebase-architecture 的直接依赖已单独纳入 |
| to-prd / to-issues / handoff | 你的流程无 PRD 阶段，spec 直连 goal 模式 |
| review（in-progress） | 上游不稳定；复核用 §1 阶段3 的 codebase-design 四项检查即可 |
