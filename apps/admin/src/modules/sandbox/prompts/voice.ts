import type { AgentBeliefSummary, AgentProfile } from "@ifss/shared";

const QUOTE_PATTERN = /[「“"]([^」”"]{1,16})[」”"]/g;
const CATCHPHRASE_MARKERS = [
  "口头禅",
  "常说",
  "最常",
  "爱说",
  "爱用",
  "爱提",
  "常提",
  "常加",
  "常带",
  "常发",
  "习惯用",
];
const NOT_CATCHPHRASE = ["绝不说", "从不说", "不喜欢说", "不会说", "不说", "叫", "称呼"];

function quotedIn(text: string): string[] {
  return [...text.matchAll(QUOTE_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((item) => item.length > 0);
}

/** 从 voice 里抽出用引号括起来的口头禅，排除「叫某人」和「绝不说」这类非口头禅。 */
export function catchphrasesOf(voice: string): string[] {
  const clauses = voice
    .split(/[，,、；;。]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
  const preferred = clauses.filter(
    (clause) =>
      CATCHPHRASE_MARKERS.some((marker) => clause.includes(marker)) &&
      !NOT_CATCHPHRASE.some((marker) => clause.includes(marker)),
  );
  const fallback = clauses.filter(
    (clause) => !NOT_CATCHPHRASE.some((marker) => clause.includes(marker)),
  );
  const picked = preferred.flatMap(quotedIn);
  return [...new Set(picked.length > 0 ? picked : fallback.flatMap(quotedIn))].slice(0, 2);
}

/** 影响力不说数字，说成「说话有没有人接」。 */
export function influenceLine(influence: number): string {
  if (influence >= 0.75) {
    return "你说一句，群里会有人顺着接";
  }
  if (influence >= 0.5) {
    return "你说的话有人看，但不一定有人接";
  }
  return "你说话常常没人接，容易被刷过去";
}

export function relationPhrase(value: number): string {
  if (value >= 0.5) return "信得过";
  if (value >= 0.15) return "有点好感";
  if (value <= -0.5) return "结过梁子";
  if (value <= -0.15) return "不太对付";
  return "没什么感觉";
}

function postureLines(profile: AgentProfile): string[] {
  const lines: string[] = [];
  const { position, intensity } = profile.stance;

  if (position === "procedural") {
    lines.push("你习惯把话往规矩上引：谁定的、合不合规矩、有没有凭据");
    lines.push("你不评价人，也不说情绪话，只谈事实和责任");
  } else if (position === "neutral" || intensity <= 0.35) {
    lines.push("你还没拿定主意，不急着表态，也不把话说满");
  }
  if (position === "support" && intensity >= 0.6) {
    lines.push("你心里是偏这边的，愿意替这边找理由");
  }
  if (position === "oppose" && intensity >= 0.6) {
    lines.push("你心里不认同对面那套说法，会挑其中的漏洞");
  }

  if (intensity >= 0.75) {
    lines.push("你的态度很硬，不打算被说服");
  } else if (intensity <= 0.3) {
    lines.push("你随时可能改口，别把话说死");
  }

  if (profile.influence >= 0.7) {
    lines.push("你的话有分量，别用在客套上；该定调就定调");
  } else if (profile.influence <= 0.4) {
    lines.push("你怕说了没人理，多用追问、附和、试探，被无视就缩回去");
  }

  if (profile.activity.level <= 0.4) {
    lines.push("你很少冒泡，一次只发一句，多余的字一个不打");
  }

  return lines;
}

function stateLines(agent: AgentBeliefSummary): string[] {
  const lines: string[] = [];
  const { state } = agent;

  if (state.mood.intensity >= 0.65) {
    lines.push(`你现在「${state.mood.label}」得厉害，说话会比平时冲`);
  } else if (state.mood.intensity <= 0.2) {
    lines.push("你现在提不起劲，冷淡一点也正常");
  }
  if (state.silent_rounds >= 2) {
    lines.push(`你已经 ${state.silent_rounds} 轮没出声，冒一句就够，不必补长篇`);
  }
  if (state.spoke_streak >= 2) {
    lines.push(`你刚连着说了 ${state.spoke_streak} 轮，收着点，别刷屏`);
  }

  return lines;
}

/** 每个角色专属的「说话方式」块：口吻来自角色卡，其余由立场与状态推出来。 */
export function buildVoiceBlock(agent: AgentBeliefSummary): string {
  const { profile } = agent;
  const phrases = catchphrasesOf(profile.voice);
  const parts = [
    `口吻：${profile.voice || "像一个普通人在群里打字"}`,
    phrases.length > 0
      ? `口头禅：${phrases.map((item) => `「${item}」`).join("、")}（整段最多用一次，别硬塞）`
      : "",
    ...[...postureLines(profile), ...stateLines(agent)].map((line) => `- ${line}`),
  ].filter((part) => part.length > 0);

  return `[怎么说话]\n${parts.join("\n")}`;
}

/** 这一轮他更可能怎么动：先定调、接话、还是看一眼就走。 */
export function defaultMoveHint(profile: AgentProfile): string {
  if (profile.activity.level <= 0.35) return "没人点你，你多半只看不回";
  if (profile.influence >= 0.7) return "你更可能自己发一条，把调子定下来";
  if (profile.influence <= 0.4) return "你更可能接别人的话，而不是自己起头";
  return "你多半先接一句，再看要不要自己发";
}

/** 这一轮他心里的算盘：不直说，但影响措辞。 */
export function motiveLine(profile: AgentProfile): string {
  const goal = profile.goals[0];
  if (!goal) return "";
  return `这一轮你在意的是「${goal}」；别把目的说得太明白。`;
}

/** 反 AI 腔的统一写作约束，act / interview 共用。 */
export const HUMAN_STYLE_RULES = `[像人，别像模型]
- 像在手机上打字：想到哪说到哪，不打草稿，能省的字就省。
- 不写「首先/其次/总之/综上/值得注意的是/换句话说/从某种角度」，不排比、不对仗、不喊口号、不总结、不升华。
- 不写客服腔：「理解你的感受」「建议您」「感谢反馈」都不说，也不主动列解决方案。
- 不用抽象大词：赋能、闭环、维度、底层逻辑、情绪价值、生态、理性客观。
- 一句话只说一件事；允许半句、省略、语气词、重复、改口，也允许不接话。
- 少用破折号和分号，句尾不必都带句号。
- 能说具体的东西（钱、时间、楼号、单号、截图、谁说过哪句）就别讲道理。
- 不复述别人的话，不替别人总结观点，不在结尾表态。`;
