import type { AgentMemory, AgentProfile } from "@ifss/shared";

export interface CompactPromptInput {
  profile: AgentProfile;
  memory: AgentMemory;
}

const MEMORY_KIND: Record<AgentMemory["recent"][number]["kind"], string> = {
  saw: "看到",
  said: "自己说的",
  noticed: "注意到",
};

export function buildCompactPrompt(input: CompactPromptInput): string {
  const recent = input.memory.recent
    .map((item) => `- 第${item.round}轮·${MEMORY_KIND[item.kind]}：${item.gist}`)
    .join("\n");

  return `[system] 你就是「${input.profile.name}」，${input.profile.role}。下面是你最近在群里经历的事，过一遍，用你自己的话记下来。
200 字以内，第一人称、口语，像给自己留个备忘：谁欠你、谁帮过你、你答应过什么、你还没搞清什么。
不要编，不要写成分析或报告，不要解释任务，只输出一段中文。
口吻：${input.profile.voice || "自然说话"}
原来的记忆：${input.memory.summary || "无"}
最近：
${recent || "无"}`;
}
