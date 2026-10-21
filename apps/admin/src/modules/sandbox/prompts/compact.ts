import type { AgentMemory, AgentProfile } from "@ifss/shared";

export interface CompactPromptInput {
  profile: AgentProfile;
  memory: AgentMemory;
}

export function buildCompactPrompt(input: CompactPromptInput): string {
  const recent = input.memory.recent
    .map((item) => `- 第${item.round}轮 [${item.kind}] ${item.gist}`)
    .join("\n");

  return `[system] 你在替一个群聊角色压缩记忆。200 字以内，保留「谁欠我、谁支持我、我立过什么 flag、我还没搞清的事」。
不得编造，不解释任务，只输出压缩后的一段中文。
角色：${input.profile.name}（${input.profile.role}）
原摘要：${input.memory.summary || "无"}
最近记忆：
${recent || "无"}`;
}
