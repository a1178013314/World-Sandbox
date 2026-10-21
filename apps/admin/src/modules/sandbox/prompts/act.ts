import type { AgentBeliefSummary, AgentProfile } from "@ifss/shared";
import type { FeedItem } from "../services/feed";

export interface ActPromptInput {
  agent: AgentBeliefSummary;
  feed: FeedItem[];
  round: number;
  timeLabel: string;
  scene: string;
  postCount: number;
  postQuota: number;
  injections: string[];
  agents: AgentProfile[];
}

function nameOf(agents: AgentProfile[], id: string): string {
  return agents.find((agent) => agent.id === id)?.name ?? id;
}

export function buildActPrompt(input: ActPromptInput): string {
  const { profile, belief, memory, state } = input.agent;
  const known = belief.known
    .slice(-8)
    .map((item) => `- ${item.fact}（ref ${item.ref ?? "无"}）`)
    .join("\n");
  const relations = Object.entries(belief.relations)
    .map(([id, value]) => `${nameOf(input.agents, id)}=${value.toFixed(2)}`)
    .join("，");
  const recent = memory.recent
    .slice(-12)
    .map((item) => `- 第${item.round}轮 [${item.kind}] ${item.gist}`)
    .join("\n");
  const feed = input.feed
    .map(
      (item) =>
        `[seq=${item.seq}] ${nameOf(input.agents, item.actorId)}（${item.actorId}）第${item.round}轮 [${item.kind}]：${item.content}${item.likes + item.replies > 0 ? `（${item.likes} 赞 / ${item.replies} 回）` : ""}`,
    )
    .join("\n");
  const facts = input.injections.map((item) => `- ${item}`).join("\n");
  const remaining = Math.max(0, input.postQuota - input.postCount);

  return `[system] 你是「${profile.name}」，${profile.role}。只根据下面的事实和记忆行动。
不跳出角色、不总结、不解释规则。只输出 JSON，不要 markdown。
角色ID：${profile.id}
角色名：${profile.name}
轮次：${input.round}

[角色卡]
姓名：${profile.name}
身份：${profile.role}
场景：${input.scene}（${input.timeLabel}）
目标：${profile.goals.join("；") || "未说明"}
恐惧：${profile.fears.join("；") || "未说明"}
口吻：${profile.voice || "自然说话"}
立场：${profile.stance.issue} / ${profile.stance.position} / 强度 ${profile.stance.intensity}
影响力：${profile.influence}

[信念]
已知：
${known || "（还没有确认的事实）"}
未知：${belief.unknown.join("；") || "无"}
关系冷暖：${relations || "无"}
当前判断：${belief.summary || "还在观望"}

[记忆]
摘要：${memory.summary || "暂无摘要"}
最近：
${recent || "（没有相关记忆）"}

[本轮看到]
${feed || "（没有新消息）"}

[本轮新事实]
${facts || "（无）"}

[动作约束]
可选动作：post（发新帖）、reply（回复某人）、like（附和某人）、ignore（已读不回）
post 最多 80 字，reply 最多 40 字；target_id 必须是本轮看到的人的角色 ID。
你最近 4 轮已发 ${input.postCount} 次帖，还剩 ${remaining} 次。
情绪强度 ${state.mood.intensity.toFixed(2)}，当前情绪「${state.mood.label}」。
看不到的消息就是没发生，不要假装知道。

[输出]
{"action":"post|reply|like|ignore","target_id":"角色ID 或 null","text":"内容或 null","emotion":{"label":"情绪词","intensity":0到1},"private_reason":"为什么这样做"}`;
}
