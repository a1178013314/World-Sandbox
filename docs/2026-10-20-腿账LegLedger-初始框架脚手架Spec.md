# 腿账 LegLedger · 初始框架脚手架技术 Spec（基础设施，不含业务逻辑）

- 日期：2026-10-20
- 状态：设计定稿，待实施
- 范围：仅覆盖**可运行的空壳**——多页构建底座、工程配置、两个入口的装配、样式基座、DOM 助手、验收门禁。
  `computeDay` / `buildRelief` 的公式与实现、`data/*.json` 与数据契约、抓数脚本、三环与账单卡的视觉、分享卡、地图染色，一律不在本 spec 范围内。
- 参照：本文**只借用** `.qoder/spec/initial-framework-scaffolding-spec.md`（guard-work）的章节结构；
  其工程基座（pnpm monorepo、NestJS、SQLite、logger、Swagger、鉴权）**不继承**。
  产品与技术口径以《2026-10-20-腿账LegLedger-整体工程设计.md》为准。

---

## 1. 目标与边界

### 1.1 交付物

一个能 `npm run dev` 起、`npm run verify` 全绿的**空壳**：

1. 仓库根即应用根，单包、无 workspace；
2. Vite 8 多页构建（`index.html` 桌面 / `mobile.html` 移动），两个入口各挂各的；
3. TypeScript strict + 路径别名 `@ → src`；
4. 样式基座（设计变量 tokens + reset/排版 base），设计系统直接取自整体设计 §9.4；
5. 极简 DOM 助手 `src/ui/dom.ts`，是全项目唯一的 DOM 语法糖；
6. Biome 统一 lint/格式化、Vitest 统一测试、`verify` 一条命令做完成判定；
7. `git init` + 首次提交，48h 期间有回滚点。

**交付物的判定不是「文件都在」，而是「`npm run verify` 全绿 + 两个入口都能打开」。**

### 1.2 明确不做

| 不做 | 归属 |
| --- | --- |
| `engine/types.ts` 契约、`computeDay`、`buildRelief`、常量表 | 计算引擎 spec |
| `data/{city}.json` 数据契约、`fetch-trip.mjs` 改造、`validate-data.mjs` | 数据管道 spec |
| 三环、账单卡、减负对比、同行人组件、圆环动画 | 呈现层 spec |
| 页面状态（`?city=&day=&relief=`）与 URL 同步 | 呈现层 spec |
| 分享卡、地图路径染色、深色模式 | P1，各自 spec |
| 后端 / 数据库 / 登录 / 埋点 / logger 包 | 产品层面已否决，永不做 |

### 1.3 一个边界说明

本 spec **不创建空目录**（`src/engine/`、`src/data/`、`scripts/`、`public/`）。
git 不跟踪空目录，几个 `.gitkeep` 只会变成噪音；目录归属写在 §3 的树里作为落位约定，谁先写谁建。

---

## 2. 技术选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 构建 | Vite 8.3 + TypeScript 5.9 | 原生 DOM 项目不需要框架插件，Vite 只负责 TS 转译、多页产物与 dev server；TS 留在 5.9，不追刚发布的 7.x 原生编译器 |
| 页面 | 原生 DOM + 双 HTML 入口 | 引擎必须是可单独调用的纯函数，界面只负责读结果画图；两个入口各自干净，避免一套媒体查询打架 |
| 测试 | Vitest 5（`happy-dom` 环境） | 与 Vite 同一套解析逻辑，别名与构建行为天然一致；DOM 助手需要真实 document 才能测 |
| Lint/Format | Biome 2.5 | 一个依赖替代 ESLint + Prettier，`--write` 一键收口，适合 AI 频繁产码的场景 |
| 版本控制 | git（`git init` + 首次提交） | 当前目录尚无版本控制，48h 里没有回滚点是最大隐性风险 |

**运行时依赖为零。** `package.json` 的 `dependencies` 必须恒为空对象；任何新增运行时库都要先改本 spec。

版本基线（实施时取最近补丁版）：

```
node >= 22.12（本地 24.x）      vite ^8.3.4
typescript ~5.9                 vitest ^5.0.5
@vitejs/plugin-* 不需要          happy-dom
@biomejs/biome ^2.5             @types/node
```

---

## 3. 目录结构

仓库根 `/2026-10-acc-hack` 即应用根：

```
2026-10-acc-hack/
├── index.html                    桌面入口（答辩投屏），挂 /src/pages/desktop.ts
├── mobile.html                   移动入口（产品演示），挂 /src/pages/mobile.ts
├── src/
│   ├── pages/
│   │   ├── desktop.ts            桌面页装配：引样式 + mount(#app)
│   │   └── mobile.ts             移动页装配：同构
│   ├── ui/
│   │   └── dom.ts                极简 DOM 助手，全项目唯一语法糖
│   └── styles/
│       ├── tokens.css            设计变量（整体设计 §9.4 原样）
│       ├── base.css              reset + 排版
│       └── index.css             唯一样式入口，@import 上面两个
├── tests/
│   └── dom.test.ts               骨架自检：dom.ts 冒烟
├── package.json
├── tsconfig.json
├── vite.config.ts
├── biome.json
├── .gitignore
├── .nvmrc
├── docs/                         既有文档，旁挂，不参与构建
└── .qoder/                       既有配置，旁挂

后续落位（本 spec 不建，谁先写谁建）：
├── src/engine/                   types / constants / compute / relief / format
├── src/data/loader.ts
├── src/pages/ 内的业务段          ui/{ring,dayCard,compare,people}.ts
├── src/styles/components.css
├── data/{chongqing,hangzhou,xian}.json
├── public/stairs.jpg
└── scripts/{fetch-trip,validate-data}.mjs
```

命名约定：文件名 camelCase（`dayCard.ts`），目录名小写；代码标识符英文，注释与页面文案中文。

---

## 4. 工程基座配置

### 4.1 package.json

```jsonc
{
  "name": "legledger",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "verify": "npm run lint && npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {},
  "devDependencies": { /* 见 §2 */ }
}
```

约定：`build` 内含 `tsc --noEmit`，类型错误不允许产出构建产物；`verify` 串行执行，任何一环红即停。

### 4.2 tsconfig.json

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`noUncheckedIndexedAccess` 是刻意保留的：引擎里全是数组遍历，这一条能在编译期挡掉一批取到 `undefined` 的运行时崩溃。

### 4.3 vite.config.ts

```ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": at("./src") } },
  server: { port: Number(process.env.VITE_PORT) || 5173 },
  build: {
    rollupOptions: {
      input: { desktop: at("./index.html"), mobile: at("./mobile.html") },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
```

**多页 `input` 是硬要求，不是可选优化。** 不声明它，`vite build` 只产出 `index.html`，`mobile.html` 静默消失，直到演示当天才发现。dev 模式下不受影响（`/mobile.html` 直接可访问），所以这个坑只在构建后暴露。

`defineConfig` 取自 `vitest/config`，让 dev / build / test 共用同一份 alias 与解析规则。

### 4.4 biome.json

```jsonc
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "files": { "includes": ["**", "!dist/**", "!node_modules/**", "!docs/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

实施时以 `npx biome init` 生成的 schema 版本为准，上面的键名若与本地 2.5.x schema 不符，按 schema 修正。

### 4.5 其他根部文件

- `.gitignore`：`node_modules/`、`dist/`、`.DS_Store`、`*.local`、`.env`、`.env.*`（保留 `!.env.example`）。
  **`data/` 不忽略**——演示断网靠的就是打包进构建产物的 JSON，它必须入库。
- `.nvmrc`：`24`（与本地一致，且满足 `>=22.12`）。
- `git init` + `git add -A` + 首次提交（提交信息：`chore: 初始框架脚手架`）。

---

## 5. 入口与页面装配

### 5.1 两个 HTML，各自挂载

| 文件 | 用途 | 挂载模块 |
| --- | --- | --- |
| `index.html` | 答辩投屏，六段纵向长页 | `/src/pages/desktop.ts` |
| `mobile.html` | 产品演示，单屏 + 底部导航 | `/src/pages/mobile.ts` |

**没有 `main.ts`，没有 UA / 屏宽分流。** 打开哪个 URL 就是哪个版本，演示时不存在"分错版本"的隐藏分支，DevTools 手机模式与投屏也不打架。

两个 HTML 的共同骨架：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#edefe8" />
    <title>腿账 · 行程体力账</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/pages/desktop.ts"></script>
  </body>
</html>
```

`#app` 是唯一挂载点，ID 固定为 `app`；`mobile.html` 的 `title` 与脚本路径对应改。

### 5.2 页面文件同构

两个页面文件结构完全一致，差异只在 `mount` 内部：

```ts
import "../styles/index.css";
import { el } from "@/ui/dom";

export function mount(root: HTMLElement): void {
  root.replaceChildren(el("main", { class: "screen" }, "腿账"));
}

const host = document.getElementById("app");
if (host) mount(host);
```

骨架期 `mount` 只渲染一个占位节点，并在函数首行留 `// TODO(呈现层): 替换为真实页面` 注释——后续 spec 从这里接管，避免占位内容残留到成品里。

---

## 6. 样式基座

三份样式文件，职责不重叠：

| 文件 | 内容 | 谁改 |
| --- | --- | --- |
| `styles/tokens.css` | 颜色、圆角、缓动变量（整体设计 §9.4 原样搬运），深色模式覆盖同一组变量 | 视觉定稿后不再动 |
| `styles/base.css` | `box-sizing` reset、`body` 背景与文字色、中文优先字体栈、`#app` 撑满、`prefers-reduced-motion` 全局降级 | 极少改 |
| `styles/index.css` | 只有两行 `@import`，顺序必须先 tokens 后 base | 后续加 `components.css` 时在此追加 |

`base.css` 关键点：

```css
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
#app { min-height: 100dvh; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

业务样式一律进 `components.css`（后续建），**不允许在 `pages/*.ts` 里写 `element.style.xxx`**——内联样式会让"改一个数看效果"的现场演示变成翻文件。

---

## 7. UI 助手契约（src/ui/dom.ts）

全项目唯一允许直接调 `document.createElement` 的地方之外都走它。目标是 40 行以内，四个导出：

```ts
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K];

export function qs<T extends HTMLElement = HTMLElement>(
  selector: string,
  scope?: ParentNode,
): T | null;

export function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
): () => void;   // 返回解绑函数

export function clear(node: HTMLElement): void;
```

行为约定：

- `el` 的 `attrs` 只接受字符串值，`class` / `id` / `data-*` / `aria-*` 走同一入口；`children` 中的 `null | undefined` 静默跳过（便于写条件子节点）。
- `on` 必须返回解绑函数——页面切换天/城市时重渲染，不解绑会累积监听器。
- 不引模板字符串拼 HTML，不用 `innerHTML` 渲染业务内容（XSS 与调试成本双输）。
- 超过 60 行或开始出现 `style` 处理，说明该开新文件，不要往这里堆。

---

## 8. 工程约定

1. **依赖方向铁律**：`engine/` 不得 import `ui/`、`pages/`、任何网络代码；`data/` 不得 import `ui/`；`ui/` 与 `pages/` 只能单向读 `engine/` 与 `data/`。骨架期用目录边界表达，后续 spec 加检查。
2. **零运行时依赖**：`dependencies` 恒为空。想加库先改本 spec，不在代码里"顺手装一个"。
3. **导入路径**：跨目录一律 `@/`，同目录允许 `./`；不写 `../../`。
4. **状态**：不引状态库。页面状态最终落在 URL query（`?city=chongqing&day=3&relief=1`），骨架期不实现。
5. **调试输出**：允许 `console.debug("[legledger] ...")`；提交里不留 `console.log`。不引 logger 包——没有后端，没有 traceId 需求。
6. **演示确定性**：页面运行时不得发起任何网络请求。数据由构建期打包，API 挂了、限流了、断网了，页面照跑。
7. **HTML 只做壳**：`index.html` / `mobile.html` 里不写业务结构，只有 `#app` 与一条 module script。

---

## 9. 落地顺序（约 30 分钟）

| # | 动作 | 完成标志 |
| --- | --- | --- |
| 1 | `git init` + 写 `.gitignore` / `.nvmrc` | `git status` 不再列出 `node_modules` |
| 2 | 写 `package.json`，装 6 个 devDependency | `npm ls --depth=0` 干净 |
| 3 | 写 `tsconfig.json` + `vite.config.ts`（含多页 input） | `npx tsc --noEmit` 通过 |
| 4 | 写 `biome.json` | `npm run lint` 通过 |
| 5 | 写两个 HTML + 两个 pages + `dom.ts` | `npm run dev` 打开 `/` 与 `/mobile.html` 都能看到「腿账」 |
| 6 | 搬 `tokens.css` / `base.css` / `index.css` | 占位页背景色为 `#edefe8` |
| 7 | 写 `tests/dom.test.ts` | `npm run test` 有 1 条真实用例通过 |
| 8 | 跑 `npm run verify`，首次提交 | 全绿，`git log` 一条 |

`tests/dom.test.ts` 至少覆盖：`el` 合并 attrs 与子节点、`el` 跳过 `null` 子节点、`on` 返回的函数确实能解绑、`clear` 清空子节点。

---

## 10. 验收标准

骨架完成的判定依据。第 1–4 条可脚本化，第 5–7 条人工 30 秒内完成。

| # | 验收项 | 验证方式 |
| --- | --- | --- |
| 1 | 门禁全绿 | 根目录 `npm run verify` 通过（lint → typecheck → test → build） |
| 2 | 双入口可达（dev） | `npm run dev` 后访问 `/` 与 `/mobile.html`，均渲染出占位内容 |
| 3 | 双入口进产物（build） | `dist/` 内同时存在 `index.html` 与 `mobile.html`；`dist/` 无模板残留文件 |
| 4 | 测试非空跑 | `npm run test` 输出中用例数 ≥ 1 且全部通过（未启用 `passWithNoTests`） |
| 5 | 依赖面 | `dependencies` 为空；`npm ls --depth=0` 仅 6 个 devDependency，无 jest / jsdom |
| 6 | 零运行时请求 | DevTools Network 面板刷新两个入口，除模块脚本外无任何请求 |
| 7 | 版本与历史 | `node -v` ≥ 22.12 且与 `.nvmrc` 一致；`git log` 至少一条提交 |
| 8 | 别名生效 | 页面文件里 `import { el } from "@/ui/dom"` 在 dev / build / test 三处均能解析 |

第 8 条尤其容易只在一处通过：`tsc` 认 `paths`、Vite 认 `alias`、Vitest 认 `test` 里的 resolve——本 spec 把三者都指向同一份 `vite.config.ts`，就是为了不让它们分叉。

---

## 11. 风险与遗留

| 项 | 说明 | 处理 |
| --- | --- | --- |
| 多页 input 漏声明 | `mobile.html` 在 build 后静默消失，dev 下完全正常，直到演示才发现 | 已写成 §4.3 硬要求 + 验收 #3 |
| Vitest 5 强制 Node ≥22.12 | 低版本 Node 直接跑不起来，报错信息不指向根因 | `engines` + `.nvmrc` 双写，验收 #7 |
| 两个页面各写一套组件 | 桌面与移动共用 `ui/`，容易出现只在一边修 bug 的漂移 | 骨架期只共享 `dom.ts`；组件复用的边界留待呈现层 spec 定 |
| 设计变量被就地改 | 现场改 tokens 找手感，改完忘了回滚，两页配色不一致 | tokens 只在 `tokens.css` 定义一次，页面禁止写字面色值 |
| 占位内容残留到成品 | 骨架的「腿账」占位若忘记替换，会出现在最终投屏页 | `mount` 首行固定留 `TODO(呈现层)` 注释，验收清单里保留一条 |
| 零运行时依赖被破坏 | 遇到"就装一个"的诱惑，演示断网时多一个失败点 | `dependencies` 恒空写进 §8，改 spec 才能加 |
| 无深色模式/分享卡 | 属 P1，不在骨架内 | 各自 spec，按《整体工程设计》§11 砍单顺序取舍 |
