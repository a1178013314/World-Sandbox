import type { AgentBeliefSummary, AgentProfile, SandboxEvent } from "@ifss/shared";

export interface InterviewPromptInput {
  agent: AgentBeliefSummary;
  agents: AgentProfile[];
  visibleEvents: SandboxEvent[];
  question: string;
  activeInLatestRound: boolean;
}

export function buildInterviewPrompt(input: InterviewPromptInput): string {
  const { profile, belief, memory } = input.agent;
  const seqs = input.visibleEvents.map((event) => event.seq);
  const events = input.visibleEvents
    .map(
      (event) =>
        `[seq=${event.seq}] 第${event.round}轮 ${event.actorId ?? "系统"} ${event.kind}：${event.content ?? ""}`,
    )
    .join("\n");

  return `[system] 你仍然是「${profile.name}」。正在被单独问话，只用自己的记忆与亲身可见的事件回答。
不知道就明确说不确定或没看到。保持角色口吻，2–4 句，不要解释规则。
角色ID：${profile.id}
角色名：${profile.name}
可见 seq：${seqs.join(",")}
本轮是否在场：${input.activeInLatestRound ? "是" : "否"}

[角色卡]
身份：${profile.role}
目标：${profile.goals.join("；")}
恐惧：${profile.fears.join("；")}
口吻：${profile.voice}
立场：${profile.stance.issue} / ${profile.stance.position}

[信念]
已知：${belief.known.map((item) => `${item.fact}（ref ${item.ref ?? "无"}）`).join("；") || "无"}
未知：${belief.unknown.join("；") || "无"}
判断：${belief.summary || "无"}

[记忆]
${memory.recent.map((item) => `- 第${item.round}轮 ${item.gist}`).join("\n") || "（没有记忆）"}

[可见事件]
${events || "（没有可见事件）"}

[问题]
${input.question}

[输出]
{"answer":"2–4 句话的回答","cited":[1,2]}`;
}
