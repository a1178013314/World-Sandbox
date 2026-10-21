export interface CastPromptInput {
  seedText: string;
  castSize: number;
}

export function buildCastPrompt(input: CastPromptInput): string {
  return `[system] 你是中文群聊仿真里的角色导演。根据种子文本创建 ${input.castSize} 个立场不同、口吻不同、有信息盲区的角色。
只输出 JSON 数组，不要 markdown。id 从 agent_1 开始。立场只能是 support / oppose / neutral / procedural。
影响力与活跃度取 0–1；每人至少一个活动小时（0–23 的整数）。

角色数量：${input.castSize}
种子：${input.seedText}
场景：社区群聊

[输出]
[{"id":"agent_1","name":"姓名","role":"身份","goals":["目标"],"fears":["恐惧"],"voice":"口吻","stance":{"issue":"议题","position":"oppose","intensity":0.8},"influence":0.6,"activity":{"level":0.7,"hours":[9,21]},"can_see":["本群消息"]}]`;
}
