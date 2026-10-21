export interface CastPromptInput {
  seedText: string;
  castSize: number;
}

export function buildCastPrompt(input: CastPromptInput): string {
  return `[system] 你在给一个中文群聊世界配人。目标不是写人物小传，是找到 ${input.castSize} 个会在同一个群里说人话、各有算盘的人。
只输出 JSON 数组，不要 markdown。id 从 agent_1 开始。

[硬要求]
1. 任意两个人至少在 3 个方面不同：身份与利益、说话方式、信息盲区、在线时段、立场与强度。
2. 角色位置要错开：直接当事人、利益相关方、执行者、旁观者、权威或规则方、靠话题吃饭的人（媒体/博主/营销号）。人少时先保证前三种。
3. 至少 1–2 个人话很少（activity.level ≤ 0.35），不要全员话痨。
4. 每人都有私心，允许不体面：想涨粉、想甩锅、想看热闹、想借机踩人。goals 写具体动作，fears 写具体后果（怕哪句话被截图、怕被谁看到）。
5. voice 是能照着演的说明书，必须写清：句子长短、标点或表情习惯、一个口头禅（用「」括起来）、怎么称呼别人、绝不会说的话。
   不要只写「理性」「客观」「中立」「专业」「稳重」这类空词。
6. name 用真实的中文叫法（王阿姨、老陈、小林、阿杰），不要「业主A」「用户1」「角色1」。
7. 立场只能是 support / oppose / neutral / procedural；影响力与活跃度取 0–1；activity.hours 给 2–6 个 0–23 的整数，不要所有人一样。
8. can_see 写这个人真正能接触到的渠道，制造信息差；不要所有人都能看到全部。

角色数量：${input.castSize}
种子：${input.seedText}
场景：社区群聊

[输出]
示例只示范 voice 的写法，人名和议题按种子来：
[{"id":"agent_1","name":"王阿姨","role":"退休 · 12 年业主","goals":["先让物业把账贴出来","拉上 5 栋一起问"],"fears":["被邻居觉得小题大做","被物业记仇"],"voice":"短句、爱反问，口头禅「账呢」，管年轻人叫「小姑娘」，绝不说「理解您的心情」","stance":{"issue":"物业费涨价","position":"oppose","intensity":0.9},"influence":0.8,"activity":{"level":0.85,"hours":[7,9,20,21]},"can_see":["本群消息","5 栋群转述"]}]`;
}
