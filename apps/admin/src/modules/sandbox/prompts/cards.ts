import type { SandboxMetrics } from "@ifss/shared";

export interface CardsPromptInput {
  scene: string;
  events: { seq: number; round: number; actorId: string | null; kind: string; content: string }[];
  metrics: SandboxMetrics | null;
}

export function buildCardsPrompt(input: CardsPromptInput): string {
  const events = input.events
    .slice(-24)
    .map(
      (event) =>
        `[seq=${event.seq}] 第${event.round}轮 ${event.actorId ?? "系统"} ${event.kind}：${event.content}`,
    )
    .join("\n");
  const metrics = input.metrics
    ? `情绪温度 ${input.metrics.emotionTemperature.toFixed(1)}，极化度 ${input.metrics.polarization.toFixed(2)}，沉默率 ${input.metrics.silentRate.toFixed(2)}，升级指数 ${input.metrics.escalationIndex.toFixed(1)}`
    : "暂无指标";

  return `[system] 你是群聊世界的观察者。挑出 3 个「名场面」，让人一眼看见刚才发生了什么。
只输出 JSON，不要 markdown。type 只能是 出圈 / 分歧 / 沉默 / 转折。
ref 必须来自下面出现过的真实 seq，quote 必须能在原文中找到依据，why 一句话。
场景：${input.scene}
可引用 seq：${input.events.map((event) => event.seq).join(",") || "无"}
指标：${metrics}

[事件]
${events || "（还没有事件）"}

[输出]
{"cards":[{"type":"出圈","quote":"原文","ref":1,"why":"入选理由"}]}`;
}
