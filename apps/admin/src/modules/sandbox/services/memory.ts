import type { AgentBelief, AgentMemory, AgentProfile, AgentState } from "@ifss/shared";

export interface SeenEvent {
  seq: number;
  content: string;
  salience: number;
}

export interface IncomingEvent {
  kind: "reply" | "like";
  actorId: string;
  mentionsAgent: boolean;
}

export interface UpdateMemoryInput {
  profile: AgentProfile;
  agents: AgentProfile[];
  belief: AgentBelief;
  memory: AgentMemory;
  state: AgentState;
  round: number;
  active: boolean;
  spoke: boolean;
  seenEvents: SeenEvent[];
  incoming?: IncomingEvent[];
}

export interface MemoryResult {
  belief: AgentBelief;
  memory: AgentMemory;
  state: AgentState;
}

const RECENT_LIMIT = 20;
const GIST_LIMIT = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function firstSentence(content: string): string {
  const match = content.trim().match(/[^。！？!?\n]+/);
  return (match?.[0] ?? content).trim();
}

function sameStance(left: AgentProfile, right: AgentProfile): boolean {
  return left.stance.position === right.stance.position;
}

function oppositeStance(left: AgentProfile, right: AgentProfile): boolean {
  return (
    (left.stance.position === "support" && right.stance.position === "oppose") ||
    (left.stance.position === "oppose" && right.stance.position === "support")
  );
}

function pushRecent(
  entries: AgentMemory["recent"],
  entry: AgentMemory["recent"][number],
): AgentMemory["recent"] {
  const recent = [...entries, entry];
  if (recent.length <= RECENT_LIMIT) {
    return recent;
  }
  let lowest = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if (recent[index]!.salience < recent[lowest]!.salience) {
      lowest = index;
    }
  }
  recent.splice(lowest, 1);
  return recent;
}

/**
 * 记忆与情绪更新：规则拼接，不调模型。被反对降关系、被附和升关系，
 * 情绪每轮衰减 0.05，全部 clamp 后再写回角色。
 */
export function updateMemory(input: UpdateMemoryInput): MemoryResult {
  if (!input.active) {
    return { belief: input.belief, memory: input.memory, state: input.state };
  }

  let recent = input.memory.recent;
  const known = [...input.belief.known];
  for (const event of input.seenEvents) {
    recent = pushRecent(recent, {
      round: input.round,
      kind: "saw",
      ref: event.seq,
      gist: event.content.slice(0, GIST_LIMIT),
      salience: event.salience,
    });
    if (!known.some((item) => item.ref === event.seq)) {
      known.push({ fact: firstSentence(event.content), ref: event.seq });
    }
  }

  const relations = { ...input.belief.relations };
  let moodIntensity = Math.max(0, input.state.mood.intensity - 0.05);
  let moodLabel = input.state.mood.label;

  for (const incoming of input.incoming ?? []) {
    const actor = input.agents.find((agent) => agent.id === incoming.actorId);
    if (!actor) {
      continue;
    }
    const current = relations[incoming.actorId] ?? 0;
    if (incoming.kind === "like" || sameStance(input.profile, actor)) {
      relations[incoming.actorId] = clamp(current + 0.05, -1, 1);
      moodIntensity += 0.05;
    } else if (oppositeStance(input.profile, actor)) {
      relations[incoming.actorId] = clamp(current - 0.1, -1, 1);
      moodIntensity += 0.1;
      moodLabel = "不满";
    }
    if (incoming.mentionsAgent) {
      moodIntensity += 0.1;
    }
  }

  const summaryFacts = known.slice(-3).map((item) => item.fact);
  const beliefSummary = [...summaryFacts, `情绪：${moodLabel}`].join(" · ");
  const nextState: AgentState = {
    ...input.state,
    mood: { label: moodLabel, intensity: clamp(moodIntensity, 0, 1) },
    actions_total: input.state.actions_total + (input.spoke ? 1 : 0),
    silent_rounds: input.spoke ? 0 : input.state.silent_rounds + 1,
    spoke_streak: input.spoke ? input.state.spoke_streak + 1 : 0,
    last_spoke_round: input.spoke ? input.round : input.state.last_spoke_round,
  };

  return {
    belief: { ...input.belief, known, relations, summary: beliefSummary },
    memory: { ...input.memory, recent },
    state: nextState,
  };
}
