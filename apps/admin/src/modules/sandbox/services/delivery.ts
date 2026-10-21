import type { EventKind } from "@ifss/shared";

export interface DeliveryPlanInput {
  seq: number;
  round: number;
  kind: EventKind | "ignore";
  actorId: string | null;
  targetId: string | null;
  mentions: string[];
  activeIds: string[];
  allAgentIds: string[];
  visibility: string;
}

export interface DeliveryEntry {
  agentId: string;
  eventSeq: number;
  seenRound: number;
  salience: number;
}

export interface DeliveryPlan {
  deliveries: DeliveryEntry[];
  deferred: boolean;
}

/**
 * 可见性矩阵：post 全在场；reply 目标+被@+作者；like 目标；定向注入等上线。
 */
export function planDelivery(input: DeliveryPlanInput): DeliveryPlan {
  const { seq, round, activeIds } = input;

  if (input.kind === "ignore") {
    return { deliveries: [], deferred: false };
  }

  if (input.round === 0 || input.kind === "system") {
    return {
      deliveries: input.allAgentIds.map((agentId) => ({
        agentId,
        eventSeq: seq,
        seenRound: round,
        salience: 0.9,
      })),
      deferred: false,
    };
  }

  if (input.kind === "intervention") {
    if (input.visibility === "all" || input.visibility === "public") {
      return {
        deliveries: activeIds.map((agentId) => ({
          agentId,
          eventSeq: seq,
          seenRound: round,
          salience: 0.9,
        })),
        deferred: false,
      };
    }
    const target = input.visibility;
    if (!activeIds.includes(target)) {
      return { deliveries: [], deferred: true };
    }
    return {
      deliveries: [{ agentId: target, eventSeq: seq, seenRound: round, salience: 0.9 }],
      deferred: false,
    };
  }

  if (input.kind === "post") {
    return {
      deliveries: activeIds.map((agentId) => ({
        agentId,
        eventSeq: seq,
        seenRound: round,
        salience: 0.5,
      })),
      deferred: false,
    };
  }

  if (input.kind === "reply") {
    const targets = new Set<string>();
    if (input.targetId) {
      targets.add(input.targetId);
    }
    for (const id of input.mentions) {
      targets.add(id);
    }
    if (input.actorId) {
      targets.add(input.actorId);
    }
    return {
      deliveries: [...targets]
        .filter((agentId) => activeIds.includes(agentId))
        .map((agentId) => ({
          agentId,
          eventSeq: seq,
          seenRound: round,
          salience: 0.6,
        })),
      deferred: false,
    };
  }

  if (input.kind === "like") {
    if (!input.targetId || !activeIds.includes(input.targetId)) {
      return { deliveries: [], deferred: false };
    }
    return {
      deliveries: [{ agentId: input.targetId, eventSeq: seq, seenRound: round, salience: 0.3 }],
      deferred: false,
    };
  }

  return { deliveries: [], deferred: false };
}
