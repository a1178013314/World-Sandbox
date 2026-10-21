import type { AgentBeliefSummary, AgentProfile, SandboxEvent } from "@ifss/shared";
import { buildVoiceBlock, HUMAN_STYLE_RULES, relationPhrase } from "./voice";

export interface InterviewPromptInput {
  agent: AgentBeliefSummary;
  agents: AgentProfile[];
  visibleEvents: SandboxEvent[];
  question: string;
  activeInLatestRound: boolean;
}

const POSITION_LABEL: Record<AgentProfile["stance"]["position"], string> = {
  support: "支持",
  oppose: "反对",
  neutral: "中立",
  procedural: "只讲程序",
};

function nameOf(agents: AgentProfile[], id: string | null): string {
  if (!id) return "系统";
  return agents.find((agent) => agent.id === id)?.name ?? id;
}

export function buildInterviewPrompt(input: InterviewPromptInput): string {
  const { profile, belief, memory } = input.agent;
  const seqs = input.visibleEvents.map((event) => event.seq);
  const events = input.visibleEvents
    .map(
      (event) =>
        `- #${event.seq} 第${event.round}轮 ${nameOf(input.agents, event.actorId)}：${event.content ?? ""}`,
    )
    .join("\n");
  const known = belief.known
    .slice(-8)
    .map((item) => `- ${item.fact}${item.ref ? `（#${item.ref}）` : ""}`)
    .join("\n");
  const relations = Object.entries(belief.relations)
    .map(([id, value]) => `${nameOf(input.agents, id)}（${relationPhrase(value)}）`)
    .join("；");
  const recent = memory.recent
    .slice(-12)
    .map((item) => `- 第${item.round}轮：${item.gist}`)
    .join("\n");

  return `[system] 你还是「${profile.name}」，${profile.role}。现在有人单独问你话，群里的人听不见。
你只能用自己看见、记得的事回答；没看到就说没看到，不确定就说不确定，别替别人补。
不跳出角色，不解释规则，只输出一个 JSON，不要 markdown。
角色ID：${profile.id}
角色名：${profile.name}
可见 seq：${seqs.join(",")}
本轮是否在场：${input.activeInLatestRound ? "是" : "否"}

${buildVoiceBlock(input.agent)}
${HUMAN_STYLE_RULES}

[你是谁]
身份：${profile.role}
目标：${profile.goals.join("；") || "没想清楚"}（私心，不用说出来）
怕的是：${profile.fears.join("；") || "没什么好怕的"}
立场：${POSITION_LABEL[profile.stance.position]}
信息来源：${profile.can_see.join("、") || "群里公开的消息"}

[你知道什么]
确认过的：
${known || "（还没有确认的事）"}
还没搞清：${belief.unknown.join("；") || "无"}
对群里的人：${relations || "都还不熟"}

[你记得什么]
${memory.summary ? `印象里：${memory.summary}\n` : ""}${recent || "（没有记忆）"}

[你亲眼看到的]
${events || "（你什么也没看到）"}

[问题]
${input.question}

[怎么答]
2–4 句，像这个人说话。可以答非所问、可以反问、可以只说一角，也可以直接说「我没看到」；不要客套、不要总结、不要解释自己。
cited 只填上面出现过的 seq，没引用就留空数组。

[输出]
{"answer":"2–4 句话的回答","cited":[1,2]}`;
}
