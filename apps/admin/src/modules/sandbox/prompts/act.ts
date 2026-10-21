import type { AgentBeliefSummary, AgentProfile } from "@ifss/shared";
import type { FeedItem } from "../services/feed";
import {
  buildVoiceBlock,
  defaultMoveHint,
  HUMAN_STYLE_RULES,
  influenceLine,
  motiveLine,
  relationPhrase,
} from "./voice";

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

const POSITION_LABEL: Record<AgentProfile["stance"]["position"], string> = {
  support: "支持",
  oppose: "反对",
  neutral: "中立",
  procedural: "只讲程序",
};

const FEED_KIND: Record<FeedItem["kind"], string> = {
  post: "发言",
  reply: "回复",
  like: "点赞",
  system: "系统",
  intervention: "新情况",
};

const MEMORY_KIND: Record<AgentBeliefSummary["memory"]["recent"][number]["kind"], string> = {
  saw: "看到",
  said: "自己说的",
  noticed: "注意到",
};

function nameOf(agents: AgentProfile[], id: string): string {
  return agents.find((agent) => agent.id === id)?.name ?? id;
}

function stanceStrength(intensity: number): string {
  if (intensity >= 0.75) return "不会改口";
  if (intensity >= 0.45) return "态度明确";
  return "随时可能变";
}

function moodLine(state: AgentBeliefSummary["state"]): string {
  const level =
    state.mood.intensity >= 0.7 ? "很重" : state.mood.intensity >= 0.4 ? "有一些" : "不重";
  return `心情：${state.mood.label}（${level}）`;
}

export function buildActPrompt(input: ActPromptInput): string {
  const { profile, belief, memory, state } = input.agent;
  const known = belief.known
    .slice(-8)
    .map((item) => `- ${item.fact}${item.ref ? `（#${item.ref}）` : ""}`)
    .join("\n");
  const relations = Object.entries(belief.relations)
    .map(([id, value]) => `${nameOf(input.agents, id)}（${relationPhrase(value)}）`)
    .join("；");
  const recent = memory.recent
    .slice(-12)
    .map((item) => `- 第${item.round}轮·${MEMORY_KIND[item.kind]}：${item.gist}`)
    .join("\n");
  const feed = input.feed
    .map((item) => {
      const target =
        item.kind === "reply" && item.targetId
          ? `，回复 ${nameOf(input.agents, item.targetId)}`
          : "";
      const mark = item.repliesToMe ? "（回你）" : item.mentionsMe ? "（点你）" : "";
      const reactions =
        item.likes + item.replies > 0 ? `（${item.likes} 赞 / ${item.replies} 回）` : "";
      return `- #${item.seq} ${nameOf(input.agents, item.actorId)}（${item.actorId}，第${item.round}轮${FEED_KIND[item.kind]}${target}）${mark}：「${item.content}」${reactions}`;
    })
    .join("\n");
  const facts = input.injections.map((item) => `- ${item}`).join("\n");
  const remaining = Math.max(0, input.postQuota - input.postCount);

  return `[system] 你是「${profile.name}」，${profile.role}。你在「${input.scene}」的群里，现在是 ${input.timeLabel}。
你在群里说话，不是在写分析。下面写了什么你就知道什么，没写的就是不知道。
不跳出角色，不解释规则，只输出一个 JSON，不要 markdown。

${buildVoiceBlock(input.agent)}
${HUMAN_STYLE_RULES}

[你是谁]
身份：${profile.role}
目标：${profile.goals.join("；") || "没想清楚"}（私心，不用说出来）
怕的是：${profile.fears.join("；") || "没什么好怕的"}
立场：${POSITION_LABEL[profile.stance.position]} · ${stanceStrength(profile.stance.intensity)}
说话分量：${influenceLine(profile.influence)}
信息来源：${profile.can_see.join("、") || "群里公开的消息"}

[你现在]
${moodLine(state)}
${motiveLine(profile)}
${defaultMoveHint(profile)}

[你知道什么]
确认过的：
${known || "（还没有确认的事）"}
还没搞清：${belief.unknown.join("；") || "无"}
对群里的人：${relations || "都还不熟"}

[你记得什么]
${memory.summary ? `印象里：${memory.summary}\n` : ""}${recent || "（没有相关记忆）"}

[群里刚才]
${feed || "（还没有人说话）"}

[本轮新事实]
${facts || "（无）"}

[这轮怎么动]
- 动作：post 新开一条 / reply 接某人的话 / like 点个赞不吭声 / ignore 看了不说。
- reply 或 like 时，target_id 填上面括号里的角色 ID（英文那个），不要填 #seq。
- post 最多 80 字，reply 最多 40 字；多数时候一句就够，别写小作文。
- 你最近 4 轮发了 ${input.postCount} 次帖，还剩 ${remaining} 次；没话说就 ignore，不必每轮都开口。
- 可以接旧话、可以只接半句，不必回应最新那条。
- 说出口的 text 不要解释自己为什么这么说，理由只写进 private_reason。
- 情绪词用你自己的说法（窝火、心累、来气），不要每次都「不满」。
开口前先想一下：这句像不像这个人会打的字？有没有在总结、解释、说漂亮话？

[输出]
先写心里话和情绪，再决定动还是不动、怎么说：
{"private_reason":"你心里的那句话，大白话，30 字以内","emotion":{"label":"情绪词","intensity":0到1},"action":"post|reply|like|ignore","target_id":"角色ID 或 null","text":"内容或 null"}`;
}
