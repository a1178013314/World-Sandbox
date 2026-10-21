import {
  type AgentAction,
  AgentActionSchema,
  type AgentBeliefSummary,
  type AgentProfile,
} from "@ifss/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { BudgetExceeded } from "../llm/budget";
import { LlmService } from "../llm/llm.service";
import { buildActPrompt } from "../prompts/act";
import type { FeedItem } from "./feed";
import { extractJson } from "./json";

export interface DecideInput {
  worldId: string;
  agent: AgentBeliefSummary;
  feed: FeedItem[];
  agents: AgentProfile[];
  round: number;
  timeLabel: string;
  scene: string;
  postCount: number;
  postQuota: number;
  injections: string[];
}

export interface ActResult {
  action: AgentAction;
  ok: boolean;
  failed: boolean;
  timedOut: boolean;
  quotaViolation: boolean;
}

function ignoreAction(reason: string): AgentAction {
  return {
    action: "ignore",
    target_id: null,
    text: null,
    emotion: { label: "平静", intensity: 0.2 },
    private_reason: reason,
  };
}

@Injectable()
export class ActorService {
  constructor(
    private readonly llm: LlmService,
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async decide(input: DecideInput): Promise<ActResult> {
    const model = this.config.get<string>("sandbox.modelAct") ?? "claude-sonnet-5-5";
    const prompt = buildActPrompt(input);
    let lastError = "";

    const parse = (raw: string): AgentAction | null => {
      try {
        const parsed = AgentActionSchema.safeParse(extractJson(raw));
        if (parsed.success) {
          return parsed.data;
        }
        lastError = parsed.error.issues.map((issue) => issue.message).join("；");
        return null;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        return null;
      }
    };

    try {
      const first = await this.complete(input, model, prompt, "act");
      let action = parse(first.raw);
      if (!action) {
        const repairPrompt = `${prompt}\n\n[上一次输出]\n${first.raw}\n\n[校验错误]\n${lastError}\n请修正后重新输出完整 JSON。`;
        const repaired = await this.complete(input, model, repairPrompt, "act_repair");
        action = parse(repaired.raw);
      }

      if (!action) {
        return {
          action: ignoreAction("schema_invalid"),
          ok: false,
          failed: true,
          timedOut: false,
          quotaViolation: false,
        };
      }

      const finalAction = this.repairTarget(action, input.feed);
      return {
        action: finalAction,
        ok: true,
        failed: false,
        timedOut: false,
        quotaViolation: finalAction.action === "post" && input.postCount >= input.postQuota,
      };
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warnWithFields("角色动作调用失败，降级为想回没赶上", {
        worldId: input.worldId,
        agentId: input.agent.profile.id,
        round: input.round,
        error: message,
      });
      return {
        action: ignoreAction("想回没赶上"),
        ok: false,
        failed: true,
        timedOut: message.includes("超时"),
        quotaViolation: false,
      };
    }
  }

  private repairTarget(action: AgentAction, feed: FeedItem[]): AgentAction {
    if (action.action !== "reply" && action.action !== "like") {
      return action;
    }
    const allowed = new Set(feed.map((item) => item.actorId));
    if (action.target_id && allowed.has(action.target_id)) {
      return action;
    }
    if (action.text) {
      return { ...action, action: "post", target_id: null };
    }
    return ignoreAction("target_not_in_feed");
  }

  private complete(
    input: DecideInput,
    model: string,
    prompt: string,
    purpose: "act" | "act_repair",
  ) {
    return this.llm.complete({
      worldId: input.worldId,
      round: input.round,
      agentId: input.agent.profile.id,
      purpose,
      model,
      prompt,
      maxTokens: 300,
      temperature: 0.8,
    });
  }
}
