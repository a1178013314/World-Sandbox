# 腿账 LegLedger · 整体工程设计

> 面向 ACC2026 两天黑客松的工程实现设计。产品口径见《2026-10-20-腿账LegLedger-行程体力账-业务逻辑设计.md》，本文只讲怎么把它做出来。

---

## 一、项目边界

### 做什么

一个**事前**的行程体力结算器。输入一份已经排好的行程和同行人，输出一张按天结算的体力账单：哪天会崩、谁先崩、砍掉哪个点能救回来。

### 不做什么

| 不做 | 原因 |
| --- | --- |
| 推荐去哪、帮你排行程 | 那是飞猪和马蜂窝的事，我们只负责验收 |
| 实时导航、当前位置 | 事前算账，不需要定位权限 |
| 健康数据、心率、卡路里 | 医学化风险，口径说不清 |
| 后端、数据库、登录 | 48h 内是负担，纯静态足够 |
| 全城市覆盖 | 三城模板，重庆为主 |

### 一句话验收标准

打开页面，不点任何东西，3 秒内能看懂"第三天 138 分，走不完"。

---

## 二、技术选型

### 结论

**Vite 5 + TypeScript 5 + 原生 DOM + 零运行时依赖。**

### 为什么不用 React

| 维度 | React | 原生 DOM | 本次选择理由 |
| --- | --- | --- | --- |
| 48h 内改 UI | 要处理状态与重渲染 | 直接改 DOM | 原生更快 |
| 页面复杂度 | 单页，四个区块 | 够用 | 不需要组件树 |
| 构建体积 | 45KB+ | 0 | 现场弱网加载快 |
| 计算与视图耦合 | 容易耦合 | 天然分离 | 计算必须是纯函数，方便单测与答辩推导 |

真正的理由是第四条：**计算引擎必须能被单独调用和验证**。用原生 DOM，引擎和界面就是两个文件，单测直接跑，答辩时能当场 `console.log(computeDay(...))` 出 138。

### 依赖清单

```json
{
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

运行时依赖：**零**。

### TypeScript 配置要点

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["vite/client"]
  }
}
```

`noUncheckedIndexedAccess` 打开，逼你在取数组元素时处理 undefined。引擎里全是数组遍历，这一条能挡掉一批线上崩溃。

---

## 三、系统架构

### 三层，单向依赖

```
┌─────────────────────────────────────────┐
│  呈现层  src/ui + src/pages              │
│  读数据、画圆环、绑交互                    │
└────────────────┬────────────────────────┘
                 │ 只读，不写
┌────────────────▼────────────────────────┐
│  计算层  src/engine                      │
│  纯函数：输入 TripInput，输出 TripBill     │
│  无 DOM、无网络、无全局状态                 │
└────────────────▲────────────────────────┘
                 │ 只读
┌────────────────┴────────────────────────┐
│  数据层  src/data + data/*.json           │
│  静态 JSON，构建时打包，运行时零请求          │
└─────────────────────────────────────────┘
```

**铁律：计算层不许 import 任何 UI 或网络代码。** 这条守住了，单测就能跑，答辩就能推。

### 数据流

```
scripts/fetch-trip.mjs  （开赛前跑一次，需要高德 key）
        │
        ▼
data/*.json  （路径、海拔、景点，落盘）
        │
        ▼
src/data/loader.ts  （类型校验 + 默认值填充）
        │
        ▼
engine/compute.ts  （纯计算）
        │
        ▼
engine/relief.ts   （减负方案）
        │
        ▼
ui/*               （渲染）
```

关键设计：**抓取和运行彻底分离**。演示时前端一个网络请求都不发，JSON 已经在构建产物里。API 挂了、限流了、没网了，页面照跑。

---

## 四、目录结构

```
legledger/
├─ data/
│  ├─ chongqing.json          # 主演示城市
│  ├─ hangzhou.json           # 备选
│  └─ xian.json               # 备选
├─ public/
│  └─ stairs.jpg              # 首屏纪实图
├─ scripts/
│  ├─ fetch-trip.mjs          # 抓数（需要 AMAP_KEY）
│  └─ validate-data.mjs       # 校验 JSON 完整性
├─ src/
│  ├─ engine/
│  │  ├─ types.ts             # 所有接口定义
│  │  ├─ constants.ts         # 权重、阈值、系数
│  │  ├─ compute.ts           # 核心计算
│  │  ├─ relief.ts            # 减负引擎
│  │  └─ format.ts            # 数字格式化（千分位、单位）
│  ├─ data/
│  │  └─ loader.ts            # 读 JSON + 校验
│  ├─ ui/
│  │  ├─ ring.ts              # 圆环组件
│  │  ├─ dayCard.ts           # 单日账单卡
│  │  ├─ compare.ts           # 减负对比
│  │  ├─ people.ts            # 同行人
│  │  └─ dom.ts               # 极简 DOM 辅助（el/h/on）
│  ├─ styles/
│  │  ├─ tokens.css           # 颜色、圆角、缓动
│  │  ├─ base.css             # reset + 排版
│  │  └─ components.css       # 组件样式
│  ├─ pages/
│  │  ├─ desktop.ts           # 桌面答辩页
│  │  └─ mobile.ts            # 移动产品页
│  └─ main.ts                 # 入口，按 UA/宽度分流
├─ tests/
│  ├─ compute.test.ts
│  ├─ relief.test.ts
│  └─ fixtures.ts
├─ index.html                 # 桌面入口
├─ mobile.html                # 移动入口
├─ package.json
└─ tsconfig.json
```

**为什么桌面和移动是两个 html**：两个页面信息密度差一倍，共用一套组件但布局完全不同。用一个页面加媒体查询，最后会变成两套样式互相打架。分成两个入口，各自干净，共享 engine 和部分 ui。

---

## 五、数据模型

全部定义在 `src/engine/types.ts`，是数据层、计算层、呈现层唯一的契约。

```ts
export type SpotType =
  | "mountain"   // 山岳
  | "trail"      // 古道 / 步道
  | "viewpoint"  // 观景台
  | "temple"     // 寺庙
  | "street"     // 商业街 / 古镇
  | "museum"     // 博物馆
  | "creative";  // 文创园

export type TransportMode = "walk" | "taxi" | "cable" | "metro";

export type AgeBand = "child" | "adult" | "senior65" | "senior70";

export type Fitness = "normal" | "weak";

export type Level = "green" | "yellow" | "orange" | "red";

export interface Spot {
  id: string;
  name: string;
  type: SpotType;
  lng: number;
  lat: number;
  stayMin: number;      // 建议停留时长
  insideKm?: number;    // 景区内步行估算，缺省按类型默认值
}

export interface Leg {
  fromId: string;
  toId: string;
  mode: TransportMode;
  distanceM: number;
  durationS: number;
  ascentM?: number;                    // 该段累计爬升，抓取时算好
  polyline?: Array<[number, number]>;  // [lng, lat]
}

export interface DayPlan {
  index: number;        // 1, 2, 3
  label: string;        // "南山到鹅岭"
  spots: Spot[];
  legs: Leg[];
  hoursOutside: number; // 含吃饭、排队、休息
}

export interface Traveler {
  id: string;
  name: string;
  ageBand: AgeBand;
  fitness: Fitness;
}

export interface TripInput {
  city: string;
  title: string;
  days: DayPlan[];
  travelers: Traveler[];
}
```

输出模型：

```ts
export interface TravelerBill {
  travelerId: string;
  factor: number;
  fatigue: number;
  level: Level;
}

export interface DayBill {
  index: number;
  label: string;
  betweenKm: number;
  insideKm: number;
  totalKm: number;
  steps: number;
  ascentM: number;
  hoursOutside: number;
  equivalentKm: number;
  baseLoad: number;
  travelers: TravelerBill[];
  worst: TravelerBill;   // 这天最可能崩的人
}

export interface TripBill {
  city: string;
  title: string;
  days: DayBill[];
  worstDay: DayBill;
}
```

**`worst` 这个字段是整个产品的表达核心。** 页面上不写"这天多累"，写"这天父亲先崩"。所有文案从 `worst` 生成。

---

## 六、计算引擎规格

### 6.1 常量表

`src/engine/constants.ts`。所有魔法数字集中在这里，答辩时改一个数就能演示敏感性。

```ts
export const STEP_LENGTH_M = 0.75;

export const WEIGHTS = {
  steps: 0.3,
  ascent: 0.4,
  hours: 0.3,
} as const;

export const NORMS = {
  steps: 20000,
  ascent: 750,
  hours: 12,
} as const;

export const AGE_FACTOR: Record<AgeBand, number> = {
  child: 1.1,
  adult: 1.0,
  senior65: 1.3,
  senior70: 1.5,
};

export const WEAK_FACTOR = 1.1;

export const LEVEL_CUT = {
  yellow: 60,
  orange: 90,
  red: 120,
} as const;

export const INSIDE_KM_DEFAULT: Record<SpotType, number> = {
  mountain: 4.0,
  trail: 6.0,
  viewpoint: 1.5,
  temple: 1.0,
  street: 2.0,
  museum: 1.5,
  creative: 0.6,
};

export const ASCENT_NOISE_M = 3;
```

### 6.2 核心函数

```ts
export function computeDay(day: DayPlan, travelers: Traveler[]): DayBill
```

**步骤：**

1. **景点间距离**：只累加 `mode === "walk"` 的 leg。打车、缆车、地铁不计入步行。
   ```
   betweenKm = Σ leg.distanceM / 1000  (仅 walk)
   ```

2. **景区内步行**：每个 spot 取 `insideKm ?? INSIDE_KM_DEFAULT[type]`，求和。
   ```
   insideKm = Σ spot.insideKm
   ```

3. **总步行与步数**：
   ```
   totalKm = betweenKm + insideKm
   steps   = round(totalKm * 1000 / 0.75)
   ```

4. **累计爬升**：从 `data` 里预先算好，存在 leg 的 `ascentM` 上（由抓取脚本算）。运行时直接求和，不在浏览器里重算海拔。
   ```
   ascentM = Σ leg.ascentM
   ```
   > 重要一：海拔采样在构建期完成，不放进运行时。浏览器里没有海拔数据，也不需要。
   >
   > 重要二：**按段采、按段存**。把所有段合并成一条线一起采，会把段与段之间的跳跃（比如打车从山脚到山顶）误算成爬升，总数会虚高几十米。

5. **等效平路**（只用于文案，不参与指数）：
   ```
   equivalentKm = totalKm + ascentM / 100 * 0.8
   ```

6. **基础负荷**：
   ```
   baseLoad = 100 * (
     0.3 * steps  / 20000 +
     0.4 * ascentM / 750   +
     0.3 * hoursOutside / 12
   )
   ```

7. **逐人体力指数**：
   ```
   factor  = AGE_FACTOR[travelers.ageBand] * (fitness === "weak" ? 1.1 : 1.0)
   fatigue = round(baseLoad * factor)
   ```

8. **判定**：
   ```ts
   function levelOf(fatigue: number): Level {
     if (fatigue > 120) return "red";
     if (fatigue > 90)  return "orange";
     if (fatigue > 60)  return "yellow";
     return "green";
   }
   ```

9. **最可能崩的人**：`travelers` 里 fatigue 最大者。并列时取年龄最大者（更有叙事性）。

### 6.3 校验基线

`tests/compute.test.ts` 必须包含这一条：

```ts
it("Day 3 南山到鹅岭算出 138", () => {
  const bill = computeDay(day3, [senior65]);
  expect(bill.steps).toBe(22000);
  expect(bill.ascentM).toBe(780);
  expect(bill.baseLoad).toBeCloseTo(106, 0);
  expect(bill.travelers[0]!.fatigue).toBe(138);
});
```

这条测试通过，说明公式与页面数字一致。**如果真实数据跑出来不是这个数，改 fixture 和页面，不改公式。**

> fixture 必须从 `data/chongqing.json` 导入，不许手抄数字。页面和测试读同一份数据，才不会出现“页面写 138、测试跑出 140”这种没法上台的情况。

### 6.4 边界处理

| 情况 | 处理 |
| --- | --- |
| 某天只有一个景点 | `legs` 为空，`betweenKm = 0`，正常算 |
| 景点坐标缺失 | `loader.ts` 构造时报错，不进计算层 |
| `hoursOutside` 为 0 | 该因子为 0，其余照算，不除零 |
| 同行人为空 | 用默认 traveler（35 岁，正常体能）补一个 |
| 指数超过 200 | 不截断，页面上显示"远超上限"，避免看起来像 bug |

---

## 七、减负引擎规格

### 7.1 设计原则

减负不是"给建议"，是**给出可对比的第二份方案**，并且这个方案能算出新的数字。

所以 `relief.ts` 的输入是 `DayPlan`，输出是**修改后的 `DayPlan`**，然后重新跑 `computeDay`。不做"估算降低 20 分"这种假动作。

```ts
export interface ReliefAction {
  ruleId: string;
  label: string;        // "南山到黄葛古道 2.4km 改打车"
  before: DayPlan;
  after: DayPlan;
}

export interface ReliefResult {
  actions: ReliefAction[];
  plan: DayPlan;        // 应用所有动作后的计划
  bill: DayBill;        // 重新算出来的账单
  savedFatigue: number; // 原账单 worst.fatigue - 新账单 worst.fatigue
}

export function buildRelief(day: DayPlan, travelers: Traveler[]): ReliefResult
```

### 7.2 规则表（MVP 三条）

只做三条，因为三条就能把 138 降到 82，且每条都能用一句话解释。

| ID | 触发条件 | 动作 | 效果 | 文案 |
| --- | --- | --- | --- | --- |
| `far-leg` | 某段 walk 的 `distanceM > 2000` | 改成 taxi，`mode = "taxi"` | 步数下降 | "南山到黄葛古道 2.4 公里，改打车" |
| `steep-leg` | 某段 walk 的 `ascentM > 150` | 改成 cable，`mode = "cable"` | 爬升下降 | "黄葛古道爬升 320 米，改坐索道" |
| `drop-spot` | 应用前两条后仍为 red/orange | 移除 `stayMin` 最小的非首尾景点 | 总负荷下降 | "砍掉鹅岭二厂，少走 1.8 公里" |

**执行顺序固定：先远段打车，再陡段缆车，最后砍点。** 顺序变了结果会不同，写进测试锁死。

### 7.3 规则实现要点

```ts
const RULES: ReliefRule[] = [
  {
    id: "far-leg",
    match: (leg) => leg.mode === "walk" && leg.distanceM > 2000,
    apply: (leg) => ({ ...leg, mode: "taxi", distanceM: 0 }),
  },
  {
    id: "steep-leg",
    match: (leg) => leg.mode === "walk" && (leg.ascentM ?? 0) > 150,
    apply: (leg) => ({ ...leg, mode: "cable", distanceM: 0, ascentM: 0 }),
  },
  // drop-spot 在 plan 层级处理
];
```

`match` 是纯函数，方便单测覆盖每条规则的命中与不命中。

### 7.4 验收基线

```ts
it("Day 3 减负后从 138 降到 82", () => {
  const relief = buildRelief(day3, [senior65]);
  expect(relief.bill.travelers[0]!.fatigue).toBe(82);
  expect(relief.savedFatigue).toBe(56);
  expect(relief.actions.length).toBeGreaterThan(0);
});
```

如果真实数据跑出来是 95 降到 71，页面就写 95 和 71。**测试跟着数据走，公式不动。**

> 写死 82 的前提是 fixture 与页面同源。当前样本参数（段 1 打车、段 3 与鹅岭删除）推到 14133 步 / 270m / 11h，回算基础负荷 63.1，×1.3 得 82。如果改了景区内步行估值，这个数会跟着变，页面和测试要一起改。

---

## 八、数据管道

### 8.1 抓取脚本

`scripts/fetch-trip.mjs`，已在 demo 目录里实现并验证语法。它做：

1. 高德 POI 搜索，景点名转坐标
2. 高德步行路径规划，逐段拿距离、时长、polyline
3. 沿 polyline 抽稀到 90 个点，调 OpenTopoData 采海拔
4. 正向高差求和（过滤 3m 以内噪声），得累计爬升
5. 加景区内步行估算，算步数与疲劳指数
6. 写出 JSON

**需要补的一点**：现在脚本只抓 Day 3。扩到三城三天，改成读一个 `data/plans.json` 配置，循环跑，每段之间 sleep 300ms 防限流。

### 8.2 数据契约

每份 `data/{city}.json` 的结构：

```json
{
  "city": "重庆",
  "title": "重庆 3 日",
  "generatedAt": "2026-10-19T10:00:00.000Z",
  "source": { "path": "amap", "elevation": "opentopodata" },
  "days": [
    {
      "index": 3,
      "label": "南山到鹅岭",
      "hoursOutside": 12.5,
      "spots": [{ "id": "nanshan", "name": "南山一棵树", "type": "viewpoint", "lng": 106.59, "lat": 29.54, "stayMin": 60, "insideKm": 1.5 }],
      "legs": [{ "fromId": "nanshan", "toId": "huangge", "mode": "walk", "distanceM": 2400, "durationS": 2100, "ascentM": 320 }]
    }
  ],
  "travelers": [{ "id": "dad", "name": "父亲", "ageBand": "senior65", "fitness": "normal" }]
}
```

### 8.3 校验脚本

`scripts/validate-data.mjs`，CI 或手动跑，检查：

- 每个 `leg.fromId / toId` 在 `spots` 里存在
- 每天 `spots.length >= 2` 时 `legs.length === spots.length - 1`
- `ascentM` 非负，`distanceM >= 0`
- 所有 `lng` 在 73 到 135，`lat` 在 3 到 54（中国境内）
- 算出 `worst.fatigue` 落在 0 到 250

最后一条是防呆：算出 800 说明参数或海拔挂了。

### 8.4 降级策略

| 情况 | 处理 |
| --- | --- |
| 没拿到 key | 用 `data.day3.sample.json` 手写数据，页面照跑 |
| 高德返回 status != 1 | 脚本报错退出，不写半份 JSON（避免脏数据） |
| OpenTopoData 超时 | 重试 3 次，仍失败则用 `ascentM` 手工估值并标记 `source.elevation = "manual"` |
| 演示现场断网 | 无影响，数据已打包进构建产物 |

---

## 九、界面规格

### 9.1 两个页面，同一套语言

| | 桌面（index.html） | 移动（mobile.html） |
| --- | --- | --- |
| 用途 | 答辩投屏，讲清楚"为什么" | 产品演示，讲清楚"怎么用" |
| 结构 | 六段纵向长页 | 单屏 App + 底部导航 |
| 主视觉 | 三环叠放（52/88/138） | 单环 252px（当前天） |
| 交互 | 滚动触发计数、点击重排 | 点 Day 圆点切换、点按钮减负 |
| 时长 | 主讲 5 分钟 | 演示 2 分钟 |

### 9.2 桌面结构（六段）

1. **首屏**：slogan + 三环叠放 + CTA
2. **数据条**：三城模板、路径来源、海拔来源
3. **三天账单**：三张卡错落排列，每张一个圆
4. **怎么算的**：纪实图 + 四行数字（16.5km / 780m / 22.7km / 1.3×）
5. **减负对比**：138 与 82 双环，可点击重排
6. **同行人**：四个圆，按指数错落
7. **收尾**：同心圆背景 + 唯一 CTA

### 9.3 移动结构（单屏）

固定高度，所有内容一屏装下，超出部分内部滚动：

```
header    腿账 / 重庆 3 日
day-switch 三个 40px 圆点
dial      252px 圆环 + 78px 数字
verdict   一句判定（"这天走不完"）
metrics   步数 / 爬升 / 在外 三格
people    四个 66px 圆，横滑
cta       54px 胶囊按钮
tabbar    四个圆点
```

### 9.4 设计系统

已有实现，直接搬到 `src/styles/tokens.css`：

```css
:root {
  --bg: #edefe8;
  --surface: #f6f7f2;
  --ink: #14201b;
  --ink-2: #59655e;
  --hair: rgba(20, 32, 27, 0.14);
  --ok: #2f7a52;
  --warn: #9a6b14;
  --bad: #b23a24;
  --accent: #14201b;
  --on-accent: #f2f4ee;
  --r-lg: 28px;
  --r-xl: 40px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
}
```

深色模式覆盖同一组变量，不动组件样式。

### 9.5 圆环组件规格

`src/ui/ring.ts`，唯一一个需要精细实现的组件。

```ts
export interface RingOptions {
  size: number;          // 直径 px
  stroke: number;        // 线宽，默认 7
  value: number;         // 0 到 150
  level: Level;
  label?: string;
  animate?: boolean;
}

export function renderRing(root: HTMLElement, opts: RingOptions): void
```

实现要点：

- SVG `viewBox="0 0 260 260"`，`r = 118`，周长 `2πr = 741.4`
- `stroke-dasharray: 741.4`，`stroke-dashoffset = 741.4 * (1 - value / 150)`
- 从 12 点方向起画：`transform: rotate(-90deg)`
- 进入视口用 `IntersectionObserver` 触发，只触发一次
- 数字用 `requestAnimationFrame` 做 1100ms 缓动
- `prefers-reduced-motion` 时直接设终值，不做动画

> 分母用 150 而不是 120：红色区间之外还要留出可见的余量，否则 138 和 200 在视觉上都顶格。

### 9.6 状态管理

不做状态库。页面状态只有三个：

```ts
interface PageState {
  city: string;
  activeDay: number;    // 移动端当前天
  reliefApplied: boolean;
}
```

存在 URL query 里：`?city=chongqing&day=3&relief=1`。好处是刷新不丢、演示可以直接跳、截图可复现。

---

## 十、测试策略

### 10.1 只测计算层

48h 内不写 UI 测试、不写 e2e。只测 `engine/`，因为它是唯一"算错了就全错"的部分。

| 文件 | 覆盖 |
| --- | --- |
| `compute.test.ts` | Day 3 基线 138、三档判定边界（59/60/61、89/90/91、119/120/121）、年龄系数叠加、空 legs、单景点 |
| `relief.test.ts` | 138 到 82、规则执行顺序、无可减项时返回原方案 |

### 10.2 边界用例必写

```ts
it("60 分是黄不是绿", () => expect(levelOf(60)).toBe("yellow"));
it("90 分是橙不是黄", () => expect(levelOf(90)).toBe("orange"));
it("120 分是橙不是红", () => expect(levelOf(120)).toBe("orange"));
it("121 分才是红", () => expect(levelOf(121)).toBe("red"));
```

判定边界错了，整个产品的"崩溃"结论就不可信。

### 10.3 跑法

```bash
npm run test        # vitest run
npm run test:watch  # 开发时
```

---

## 十一、48h 排期

按**一人 + AI**估算。两个人就把数据线和界面线并行。

### Day 1（10h）：把数字跑通

| 时段 | 交付 | 完成标志 |
| --- | --- | --- |
| H0–H1 | 项目脚手架 + 类型定义 | `npm run dev` 起得来，`types.ts` 写完 |
| H1–H2 | 计算引擎 | `computeDay` 用手写 fixture 算出 138，单测绿 |
| H2–H3 | 减负引擎 | `buildRelief` 算出 82，单测绿 |
| H3–H5 | 数据抓取 | 重庆三天 JSON 落盘，`validate-data` 通过 |
| H5–H6 | 数据对接 | 页面读 JSON，三天的数字真实可复算 |
| H6–H8 | 桌面首屏 | 三环叠放出来，动画正常 |
| H8–H10 | 桌面三天账单 | 三张卡错落，数字与引擎一致 |

**Day 1 结束时的最低标准**：终端里 `npm test` 全绿，浏览器里能看到 138。

### Day 2（10h）：把它变成能看的东西

| 时段 | 交付 | 完成标志 |
| --- | --- | --- |
| H10–H12 | 桌面后四段 | 怎么算的、减负对比、同行人、收尾 |
| H12–H14 | 移动端单屏 | 一屏装下，四个交互可用 |
| H14–H15 | 响应式与深色 | 390 和 1440 都不溢出，深色可读 |
| H15–H16 | 兜底与降级 | 断网刷新照常，JSON 缺失有提示 |
| H16–H17 | 录屏 | 全链路 3 分钟一份 |
| H17–H18 | 答辩页 | 五页，每页一个数字 |
| H18–H19 | 彩排 3 遍 | 计时，卡壳处改文案 |
| H19–H20 | 缓冲 | 只修阻断问题，不加功能 |

### 砍单优先级

按这个顺序砍，从下往上：

1. 三城模板 → 只留重庆
2. 移动端 → 只留桌面（但会丢一半演示效果）
3. 地图路径染色 → 用文字代替
4. 分享卡生成
5. 深色模式
6. 减负动画 → 直接跳变

**首屏三环和 138 到 82 的对比，永远不砍。**

---

## 十二、验收清单

答辩前逐条打勾。

### 计算

- [ ] `npm test` 全绿，无跳过用例
- [ ] Day 3 算出 138，与页面一致
- [ ] 减负后算出 82，与页面一致
- [ ] 判定边界 60/90/120 单测通过
- [ ] 手算一遍能在 30 秒内对上台上的数字

### 数据

- [ ] 三天的 `legs` 与 `spots` 数量自洽
- [ ] `source` 字段写明 amap 和 opentopodata
- [ ] `generatedAt` 是真实抓取时间，不是写死的
- [ ] 断网后刷新，页面数字不变

### 桌面

- [ ] 1440 宽度下无横向滚动
- [ ] 首屏 3 秒内看懂"第三天走不完"
- [ ] 三个环的弧线无遮挡
- [ ] 所有 CTA 文案一致

### 移动

- [ ] 390 宽度下一屏装下，`.screen` 的 scrollHeight 等于 clientHeight
- [ ] 点 Day 1/2/3，数字、颜色、文案三者同步变
- [ ] 点减负，138 变 82，按钮变"还原原版"
- [ ] 底部导航不被安全区遮挡

### 演示

- [ ] 连续彩排 3 遍不卡壳
- [ ] 有一份完整录屏
- [ ] 有一页能用一句话解释公式
- [ ] 被问"数据哪来的"能立刻答出接口名

---

## 十三、风险与对策

| 风险 | 概率 | 影响 | 对策 |
| --- | --- | --- | --- |
| 真实数据算出来不是 138 | 高 | 中 | 改页面数字，不改公式。这是产品可信度的底线 |
| 高德 key 类型不对（JS API 而非 Web 服务） | 中 | 高 | 建 key 时选"Web服务"，路径规划只认这个 |
| 现场网络差 | 中 | 高 | 数据打包进构建产物，零运行时请求 |
| 评委追问"疲劳指数有科学依据吗" | 高 | 中 | 答"权重来自 Naismith 规则与公开步速研究，是工程近似，不是医学模型"，并主动说明口径边界 |
| 演示设备分辨率异常 | 低 | 中 | 两个入口分别适配，带一份录屏兜底 |
| 时间不够做移动端 | 中 | 低 | 砍单清单第 2 条，桌面已能讲完故事 |

### 答辩最可能被问的三个问题

**问：这个和运动 App 有什么区别？**

答：运动 App 记录你走了多少，我们事前告诉你走不走得动。一个在事后，一个在事前。

**问：为什么是 138 不是 150？**

答：三个因子加权，步数占 0.3、爬升占 0.4、在外时长占 0.3，再乘 65 岁的 1.3。当场可以手算。

**问：通用大模型也能回答"累不累"。**

答：它能说"注意休息"，说不出 780 米爬升和 22.7 公里等效平路。这些数字来自路径 API 和海拔采样，模型只负责翻译成人话。它给不出可复算的数。

---

## 十四、开搞第一步

```bash
npm create vite@latest legledger -- --template vanilla-ts
cd legledger
npm i -D vitest
mkdir -p src/engine src/ui src/data src/styles src/pages tests data scripts
```

然后把现有资产搬过去：

| 现有文件 | 搬到 | 处理方式 |
| --- | --- | --- |
| `legledger-demo/index.html` | `index.html` + `src/pages/desktop.ts` | HTML 拆成模板，样式进 `styles/` |
| `legledger-demo/mobile.html` | `mobile.html` + `src/pages/mobile.ts` | 同上 |
| `legledger-demo/stairs.jpg` | `public/stairs.jpg` | 直接复制 |
| `scripts/fetch-trip.mjs` | `scripts/fetch-trip.mjs` | 改成读 `plans.json` 循环 |
| `data/day3.sample.json` | `tests/fixtures.ts` | 转成 TypeScript fixture |
| 业务逻辑设计文档 | 不入仓库 | 放文档目录，答辩时引用 |

**第一个要写的文件是 `src/engine/types.ts`，不是 HTML。** 类型定完，数据、计算、界面三条线才能并行。

---

## 附：文件完整性

| 文件 | 状态 |
| --- | --- |
| 业务逻辑设计 | 已完成，含公式与复算表 |
| 桌面页 demo | 已完成，已验证 |
| 移动页 demo | 已完成，已验证 |
| 数据抓取脚本 | 已完成，待 key 实跑 |
| 样本数据 | 已完成，字段与脚本一致 |
| 整体工程设计 | 本文 |
